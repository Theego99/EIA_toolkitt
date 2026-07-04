// ─────────────────────────────────────────────────────────────────────────────
// オフラインファースト同期サービス
//
// 設計原則（Reactアプリで実証済みのパターンを踏襲）:
//   1. 全ての書き込みはまずローカル（Hive）へ → 即座にUIに反映
//   2. オンラインなら直接Supabaseへupsert、失敗・オフラインならキューへ
//   3. 接続回復・定期ポーリングでキューをフラッシュ
//   4. recentlyWritten セットで自分の書き込みのRealtimeエコーを抑制
//   5. IDは常にUUID文字列（タイムスタンプID事故の再発防止）
// ─────────────────────────────────────────────────────────────────────────────
import 'dart:async';
import 'package:connectivity_plus/connectivity_plus.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:uuid/uuid.dart';

import '../models/models.dart';

const _uuid = Uuid();

class SyncStatus {
  final bool online;
  final int pending;
  final bool syncing;
  final String? error;
  const SyncStatus({
    this.online = true,
    this.pending = 0,
    this.syncing = false,
    this.error,
  });

  SyncStatus copyWith({bool? online, int? pending, bool? syncing, String? error}) =>
      SyncStatus(
        online: online ?? this.online,
        pending: pending ?? this.pending,
        syncing: syncing ?? this.syncing,
        error: error,
      );
}

class ProjectRepository {
  final SupabaseClient _sb;
  late final Box _cache; // projects cache
  late final Box _queue; // sync queue

  String? orgId;

  // Realtimeエコー抑制
  final Set<String> _recentlyWritten = {};

  final _projectsController = StreamController<List<Project>>.broadcast();
  final _statusController = StreamController<SyncStatus>.broadcast();

  Stream<List<Project>> get projects$ => _projectsController.stream;
  Stream<SyncStatus> get status$ => _statusController.stream;

  SyncStatus _status = const SyncStatus();
  List<Project> _projects = [];

  RealtimeChannel? _channel;
  Timer? _pollTimer;
  StreamSubscription? _connSub;

  ProjectRepository(this._sb);

  List<Project> get currentProjects => List.unmodifiable(_projects);

  Future<void> init() async {
    _cache = await Hive.openBox('projects_cache');
    _queue = await Hive.openBox('sync_queue');

    // 1. ゾンビキューエントリの除去（数字のみのIDは旧タイムスタンプID）
    final zombieKeys = _queue.keys.where((k) {
      final entry = Map<String, dynamic>.from(_queue.get(k) as Map);
      final id = (entry['payload']?['id'] ?? '').toString();
      return RegExp(r'^\d{10,}$').hasMatch(id);
    }).toList();
    for (final k in zombieKeys) {
      await _queue.delete(k);
    }

    // 2. ローカルキャッシュから即座にロード（オフライン起動対応）
    _projects = _cache.values
        .map((v) => Project.fromCache(Map<String, dynamic>.from(v as Map)))
        .where((p) => !RegExp(r'^\d{10,}$').hasMatch(p.id))
        .toList();
    _emit();

    // 3. 接続監視
    _connSub = Connectivity().onConnectivityChanged.listen((results) {
      final online = !results.contains(ConnectivityResult.none);
      _setStatus(_status.copyWith(online: online));
      if (online) flushQueue();
    });

    // 4. 定期フラッシュ（10秒）
    _pollTimer = Timer.periodic(const Duration(seconds: 10), (_) {
      if (_status.online && _queue.isNotEmpty) flushQueue();
    });

    _updatePending();
  }

  /// ログイン後に呼ぶ：Supabaseから正規データを取得し、キューをフラッシュ
  Future<void> loadFromServer() async {
    try {
      final rows = await _sb
          .from('projects')
          .select()
          .order('created_at', ascending: false);
      _projects = (rows as List)
          .map((r) => Project.fromRow(Map<String, dynamic>.from(r)))
          .toList();
      // キャッシュ更新
      await _cache.clear();
      for (final p in _projects) {
        await _cache.put(p.id, p.toCache());
      }
      _emit();
      await flushQueue();
      _subscribeRealtime();
    } catch (e) {
      _setStatus(_status.copyWith(error: 'サーバー読込エラー: $e'));
    }
  }

  void _subscribeRealtime() {
    _channel?.unsubscribe();
    _channel = _sb
        .channel('projects-live')
        .onPostgresChanges(
          event: PostgresChangeEvent.all,
          schema: 'public',
          table: 'projects',
          callback: (payload) {
            switch (payload.eventType) {
              case PostgresChangeEvent.delete:
                final id = payload.oldRecord['id']?.toString() ?? '';
                if (_recentlyWritten.remove(id)) return; // 自分のエコー
                _projects.removeWhere((p) => p.id == id);
                _cache.delete(id);
                _emit();
              case PostgresChangeEvent.insert:
              case PostgresChangeEvent.update:
                final row = payload.newRecord;
                final id = row['id']?.toString() ?? '';
                if (_recentlyWritten.remove(id)) return; // 自分のエコー
                final incoming = Project.fromRow(row);
                final idx = _projects.indexWhere((p) => p.id == id);
                if (idx >= 0) {
                  _projects[idx] = incoming;
                } else {
                  _projects.insert(0, incoming);
                }
                _cache.put(id, incoming.toCache());
                _emit();
              default:
                break;
            }
          },
        )
        .subscribe();
  }

  // ── 書き込みAPI ──────────────────────────────────────────────────────────

  static String newId() => _uuid.v4();

  Future<void> upsertProject(Project p) async {
    // 1. ローカル状態 — upsert by ID、重複は構造的に不可能
    final idx = _projects.indexWhere((x) => x.id == p.id);
    if (idx >= 0) {
      _projects[idx] = p;
    } else {
      _projects.insert(0, p);
    }
    await _cache.put(p.id, p.toCache());
    _emit();

    // 2. リモート書き込み
    await _writeRemote('upsert', p.toRow(orgId), p.id);
  }

  Future<void> deleteProject(String id) async {
    _projects.removeWhere((p) => p.id == id);
    await _cache.delete(id);
    // この案件の未送信upsertをキューから除去（削除済み案件の復活防止）
    final staleKeys = _queue.keys.where((k) {
      final e = Map<String, dynamic>.from(_queue.get(k) as Map);
      return (e['payload']?['id'] ?? '').toString() == id;
    }).toList();
    for (final k in staleKeys) {
      await _queue.delete(k);
    }
    _emit();
    await _writeRemote('delete', {'id': id}, id);
  }

  Future<void> _writeRemote(
      String op, Map<String, dynamic> payload, String id) async {
    if (!_status.online) {
      await _enqueue(op, payload);
      return;
    }
    try {
      _recentlyWritten.add(id);
      if (op == 'upsert') {
        if (payload['organization_id'] == null) {
          throw Exception('organization_id 未設定');
        }
        await _sb.from('projects').upsert(payload);
      } else {
        await _sb.from('projects').delete().eq('id', id);
      }
      // 5秒後にエコー抑制を解除
      Timer(const Duration(seconds: 5), () => _recentlyWritten.remove(id));
      _setStatus(_status.copyWith(error: null));
    } catch (e) {
      _recentlyWritten.remove(id);
      await _enqueue(op, payload);
      _setStatus(_status.copyWith(error: '同期失敗（キューに保存）'));
    }
    _updatePending();
  }

  Future<void> _enqueue(String op, Map<String, dynamic> payload) async {
    await _queue.add({
      'op': op,
      'payload': payload,
      'ts': DateTime.now().millisecondsSinceEpoch,
    });
    _updatePending();
  }

  Future<void> flushQueue() async {
    if (!_status.online || _queue.isEmpty || _status.syncing) return;
    _setStatus(_status.copyWith(syncing: true));

    final keys = _queue.keys.toList();
    for (final k in keys) {
      final raw = _queue.get(k);
      if (raw == null) continue;
      final entry = Map<String, dynamic>.from(raw as Map);
      final payload = Map<String, dynamic>.from(entry['payload'] as Map);
      final id = (payload['id'] ?? '').toString();

      // ゾンビID — 即除去
      if (RegExp(r'^\d{10,}$').hasMatch(id)) {
        await _queue.delete(k);
        continue;
      }

      // org_id欠落を補完してから送信
      if (entry['op'] == 'upsert' && payload['organization_id'] == null) {
        if (orgId == null) continue; // orgがまだ無い：次回リトライ
        payload['organization_id'] = orgId;
      }

      try {
        _recentlyWritten.add(id);
        if (entry['op'] == 'upsert') {
          await _sb.from('projects').upsert(payload);
        } else {
          await _sb.from('projects').delete().eq('id', id);
        }
        await _queue.delete(k);
        Timer(const Duration(seconds: 5), () => _recentlyWritten.remove(id));
      } catch (e) {
        _recentlyWritten.remove(id);
        // 失敗 — キューに残して次回リトライ
      }
    }

    _setStatus(_status.copyWith(syncing: false, error: null));
    _updatePending();
  }

  // ── 内部 ──────────────────────────────────────────────────────────────────

  void _emit() => _projectsController.add(List.unmodifiable(_projects));

  void _setStatus(SyncStatus s) {
    _status = s;
    _statusController.add(s);
  }

  void _updatePending() =>
      _setStatus(_status.copyWith(pending: _queue.length));

  void dispose() {
    _channel?.unsubscribe();
    _pollTimer?.cancel();
    _connSub?.cancel();
    _projectsController.close();
    _statusController.close();
  }
}
