import { useEffect, useRef, useState } from "react";
import { X, LoaderCircle, ArrowRight, AlertTriangle } from "lucide-react";

export function Button({ children, icon: Icon, variant = "", busy, ...props }) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ""}`}
    >
      {busy ? (
        <LoaderCircle size={16} className="spin" />
      ) : Icon ? (
        <Icon size={16} />
      ) : null}
      {children}
    </button>
  );
}
export function Field({ label, hint, children, ...props }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children || <input {...props} />} {hint && <small>{hint}</small>}
    </label>
  );
}
export function Panel({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head">
        <div>
          <h2>{title}</h2>
          {subtitle && <p>{subtitle}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function Empty({ title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <ArrowRight size={22} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}
export function Badge({ children, tone = "" }) {
  return <span className={`badge ${tone}`}>{children}</span>;
}
export function Notice({ children, tone = "info" }) {
  return (
    <div className={`notice ${tone}`}>
      <AlertTriangle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Modal({ title, onClose, children, wide = false }) {
  const ref = useRef(null);
  function close() {
    if (
      ref.current?.querySelector('form[data-dirty="true"]') &&
      !window.confirm("未保存の入力を破棄して閉じますか？")
    )
      return;
    onClose();
  }
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="閉じる"
          onClick={close}
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export function AsyncForm({
  onSubmit,
  children,
  submitLabel = "保存する",
  disabled = false,
  secondary,
}) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const guard = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  return (
    <form
      data-dirty={dirty}
      onChange={() => setDirty(true)}
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        const form = e.currentTarget;
        try {
          await onSubmit(Object.fromEntries(new FormData(form)), form);
          setDirty(false);
        } catch (err) {
          setError(err.message || String(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <fieldset disabled={busy || disabled}>{children}</fieldset>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="form-actions">
        {dirty && (
          <small className="unsaved-label">未保存の変更があります</small>
        )}
        {secondary}
        <Button variant="primary" type="submit" busy={busy} disabled={disabled}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
export function Time({ value }) {
  const valid = value && Number.isFinite(+new Date(value));
  return (
    <time dateTime={value}>
      {valid
        ? new Intl.DateTimeFormat("ja-JP", {
            timeZone: "Asia/Tokyo",
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(value))
        : value
          ? String(value)
          : "—"}
    </time>
  );
}
