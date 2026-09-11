import { useRef, useState } from "react";
import { Printer } from "lucide-react";
import { Button, Modal, Notice } from "./ui.jsx";

export default function ReportPreview({ report, store, onClose }) {
  const frame = useRef(null),
    [ready, setReady] = useState(false),
    [error, setError] = useState("");
  return (
    <Modal wide title={`${report.label} · 出力した版`} onClose={onClose}>
      <div className="row-between">
        <small>
          Word原本のプレビューです。最終的な改ページは提出先のWord環境でも確認してください。
        </small>
        <Button
          icon={Printer}
          disabled={!ready}
          onClick={() => {
            frame.current.contentWindow.focus();
            frame.current.contentWindow.print();
          }}
        >
          印刷・PDFに保存
        </Button>
      </div>
      {error && <Notice tone="warning">{error}</Notice>}
      {!ready && !error && <p className="help-text">報告書を表示しています…</p>}
      <iframe
        ref={frame}
        title="報告書プレビュー"
        sandbox="allow-same-origin allow-modals"
        className="report-preview"
        srcDoc="<!doctype html><html lang='ja'><head><meta charset='utf-8'></head><body></body></html>"
        onLoad={async () => {
          try {
            const { renderAsync } = await import("docx-preview");
            const blob = await store.file(report);
            if (!frame.current) return;
            await renderAsync(blob, frame.current.contentDocument.body, null, {
              inWrapper: true,
              renderHeaders: true,
              renderFooters: true,
              ignoreLastRenderedPageBreak: false,
              breakPages: true,
            });
            const style = frame.current.contentDocument.createElement("style");
            const scale = Math.min(1, (frame.current.clientWidth - 32) / 794);
            style.textContent = `body{margin:0;background:#eee;font-family:Yu Gothic,Meiryo,sans-serif}.docx-wrapper{padding:16px!important;zoom:${scale}}@media print{body{background:white}.docx-wrapper{zoom:1;padding:0!important;background:white!important}section.docx{box-shadow:none!important;margin:0!important}}`;
            frame.current.contentDocument.head.append(style);
            setReady(true);
          } catch (e) {
            setError(`プレビューを表示できません: ${e.message}`);
          }
        }}
      />
    </Modal>
  );
}
