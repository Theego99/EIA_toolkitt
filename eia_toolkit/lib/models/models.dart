// ─────────────────────────────────────────────────────────────────────────────
// データモデル — Supabaseスキーマ（snake_case）⇄ Dart（camelCase）の変換を内包
// ─────────────────────────────────────────────────────────────────────────────
import '../core/constants.dart';

class TaskItem {
  final String id;
  final String label;
  bool done;

  TaskItem({required this.id, required this.label, this.done = false});

  Map<String, dynamic> toJson() => {'id': id, 'label': label, 'done': done};

  factory TaskItem.fromJson(Map<String, dynamic> j) => TaskItem(
        id: j['id'].toString(),
        label: j['label'] as String? ?? '',
        done: j['done'] as bool? ?? false,
      );
}

class SpeciesRecord {
  final String id;
  final String name;
  final String scientificName;
  final String category; // 鳥類, 哺乳類, 植物...
  final String redListStatus; // CR, EN, VU, NT, LC, —
  final String location;
  final String date;
  final String notes;

  SpeciesRecord({
    required this.id,
    required this.name,
    this.scientificName = '',
    this.category = '',
    this.redListStatus = '—',
    this.location = '',
    this.date = '',
    this.notes = '',
  });

  bool get isRedListed =>
      ['CR', 'EN', 'VU', 'NT'].contains(redListStatus.toUpperCase());

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'scientificName': scientificName,
        'category': category,
        'redListStatus': redListStatus,
        'location': location,
        'date': date,
        'notes': notes,
      };

  factory SpeciesRecord.fromJson(Map<String, dynamic> j) => SpeciesRecord(
        id: j['id'].toString(),
        name: j['name'] as String? ?? '',
        scientificName: j['scientificName'] as String? ?? '',
        category: j['category'] as String? ?? '',
        redListStatus: j['redListStatus'] as String? ?? '—',
        location: j['location'] as String? ?? '',
        date: j['date'] as String? ?? '',
        notes: j['notes'] as String? ?? '',
      );
}

class ProjectDocument {
  final String id;
  final String name;
  final int size;
  final String url;
  final String status; // 作業中, レビュー中, 承認済, 提出済, 却下
  final String uploadedBy;
  final String uploadedAt;
  final int stage;

  ProjectDocument({
    required this.id,
    required this.name,
    this.size = 0,
    this.url = '',
    this.status = '作業中',
    this.uploadedBy = '',
    this.uploadedAt = '',
    this.stage = 1,
  });

  ProjectDocument copyWith({String? status}) => ProjectDocument(
        id: id,
        name: name,
        size: size,
        url: url,
        status: status ?? this.status,
        uploadedBy: uploadedBy,
        uploadedAt: uploadedAt,
        stage: stage,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'size': size,
        'url': url,
        'status': status,
        'uploadedBy': uploadedBy,
        'uploadedAt': uploadedAt,
        'stage': stage,
      };

  factory ProjectDocument.fromJson(Map<String, dynamic> j) => ProjectDocument(
        id: j['id'].toString(),
        name: j['name'] as String? ?? '',
        size: (j['size'] as num?)?.toInt() ?? 0,
        url: j['url'] as String? ?? '',
        status: j['status'] as String? ?? '作業中',
        uploadedBy: j['uploadedBy'] as String? ?? '',
        uploadedAt: j['uploadedAt'] as String? ?? '',
        stage: (j['stage'] as num?)?.toInt() ?? 1,
      );
}

class ProjectComment {
  final String id;
  final String text;
  final String author;
  final String date;
  final String role;

  ProjectComment({
    required this.id,
    required this.text,
    required this.author,
    required this.date,
    this.role = '',
  });

  Map<String, dynamic> toJson() =>
      {'id': id, 'text': text, 'author': author, 'date': date, 'role': role};

  factory ProjectComment.fromJson(Map<String, dynamic> j) => ProjectComment(
        id: j['id'].toString(),
        text: j['text'] as String? ?? '',
        author: j['author'] as String? ?? '',
        date: j['date'] as String? ?? '',
        role: j['role'] as String? ?? '',
      );
}

class Project {
  final String id;
  String name;
  String client;
  String type;
  int stage;
  String pref;
  String? deadline;
  String? area;
  String? budget;
  String? desc;
  String? manager;
  String risk;
  int progress;
  String projectClass; // '1' | '2' | 'ordinance'
  Map<String, String> juranDates; // 'juran_2' -> 'YYYY-MM-DD'
  List<EiaStage>? customStages;
  Map<int, List<TaskItem>> tasks;
  List<SpeciesRecord> species;
  List<ProjectDocument> documents;
  List<ProjectComment> comments;

  Project({
    required this.id,
    required this.name,
    this.client = '',
    this.type = 'wind',
    this.stage = 1,
    this.pref = '東京都',
    this.deadline,
    this.area,
    this.budget,
    this.desc,
    this.manager,
    this.risk = 'low',
    this.progress = 0,
    this.projectClass = '1',
    Map<String, String>? juranDates,
    this.customStages,
    Map<int, List<TaskItem>>? tasks,
    List<SpeciesRecord>? species,
    List<ProjectDocument>? documents,
    List<ProjectComment>? comments,
  })  : juranDates = juranDates ?? {},
        tasks = tasks ?? {},
        species = species ?? [],
        documents = documents ?? [],
        comments = comments ?? [];

  List<EiaStage> get stages => customStages ?? kStages;

  int get redListCount => species.where((s) => s.isRedListed).length;

  int get currentStageIndex {
    final idx = stages.indexWhere((s) => s.id == stage);
    return idx < 0 ? 0 : idx;
  }

  EiaStage get currentStage => stages[currentStageIndex];

  /// 縦覧終了日（開始 + 30日）
  DateTime? juranEndDate(int stageId) {
    final start = juranDates['juran_$stageId'];
    if (start == null || start.isEmpty) return null;
    return DateTime.tryParse(start)?.add(const Duration(days: kJuranDays));
  }

  /// 知事意見期限（準備書のみ：縦覧終了 + 4ヶ月）
  DateTime? governorOpinionDeadline() {
    if (stage != 4) return null;
    final end = juranEndDate(4);
    return end?.add(const Duration(days: kGovernorOpinionDays));
  }

  double get overallProgress {
    if (tasks.isEmpty) return 0;
    int total = 0, done = 0;
    for (final list in tasks.values) {
      total += list.length;
      done += list.where((t) => t.done).length;
    }
    return total == 0 ? 0 : done / total;
  }

  // ── Supabase row mapping ──
  Map<String, dynamic> toRow(String? orgId) => {
        'id': id,
        if (orgId != null) 'organization_id': orgId,
        'name': name,
        'client': client,
        'type': type,
        'stage': stage,
        'pref': pref,
        'deadline': (deadline?.isEmpty ?? true) ? null : deadline,
        'area': area,
        'budget': budget,
        'description': desc,
        'manager': manager,
        'risk': risk,
        'progress': (overallProgress * 100).round(),
        'red_list_count': redListCount,
        'project_class': projectClass,
        'juran_dates': juranDates,
        'custom_stages': customStages?.map((s) => s.toJson()).toList(),
        'tasks': tasks.map((k, v) =>
            MapEntry(k.toString(), v.map((t) => t.toJson()).toList())),
        'species_data': species.map((s) => s.toJson()).toList(),
        'documents': documents.map((d) => d.toJson()).toList(),
        'comments': comments.map((c) => c.toJson()).toList(),
      };

  factory Project.fromRow(Map<String, dynamic> r) {
    Map<int, List<TaskItem>> parseTasks(dynamic raw) {
      if (raw is! Map) return {};
      return raw.map((k, v) => MapEntry(
            int.tryParse(k.toString()) ?? 0,
            (v as List? ?? [])
                .map((t) => TaskItem.fromJson(Map<String, dynamic>.from(t)))
                .toList(),
          ));
    }

    List<EiaStage>? parseStages(dynamic raw) {
      if (raw is! List || raw.isEmpty) return null;
      return raw
          .map((s) => EiaStage.fromJson(Map<String, dynamic>.from(s)))
          .toList();
    }

    return Project(
      id: r['id'].toString(),
      name: r['name'] as String? ?? '',
      client: r['client'] as String? ?? '',
      type: r['type'] as String? ?? 'wind',
      stage: (r['stage'] as num?)?.toInt() ?? 1,
      pref: r['pref'] as String? ?? '東京都',
      deadline: r['deadline'] as String?,
      area: r['area']?.toString(),
      budget: r['budget']?.toString(),
      desc: r['description'] as String?,
      manager: r['manager'] as String?,
      risk: r['risk'] as String? ?? 'low',
      progress: (r['progress'] as num?)?.toInt() ?? 0,
      projectClass: r['project_class'] as String? ?? '1',
      juranDates: (r['juran_dates'] as Map?)
              ?.map((k, v) => MapEntry(k.toString(), v.toString())) ??
          {},
      customStages: parseStages(r['custom_stages']),
      tasks: parseTasks(r['tasks']),
      species: ((r['species_data'] as List?) ?? [])
          .map((s) => SpeciesRecord.fromJson(Map<String, dynamic>.from(s)))
          .toList(),
      documents: ((r['documents'] as List?) ?? [])
          .map((d) => ProjectDocument.fromJson(Map<String, dynamic>.from(d)))
          .toList(),
      comments: ((r['comments'] as List?) ?? [])
          .map((c) => ProjectComment.fromJson(Map<String, dynamic>.from(c)))
          .toList(),
    );
  }

  /// Hive cache round-trip (same shape as Supabase row, org-agnostic)
  Map<String, dynamic> toCache() => toRow(null);
  factory Project.fromCache(Map<String, dynamic> c) => Project.fromRow(c);
}

class UserProfile {
  final String id;
  final String name;
  final String email;
  final UserRole role;
  final String? orgId;
  final String? orgName;
  final String? orgPlan;

  UserProfile({
    required this.id,
    required this.name,
    required this.email,
    required this.role,
    this.orgId,
    this.orgName,
    this.orgPlan,
  });
}
