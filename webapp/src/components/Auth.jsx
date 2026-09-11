import { useState } from "react";
import {
  ArrowUpRight,
  Leaf,
  ShieldCheck,
  Layers3,
  CloudOff,
} from "lucide-react";
import { supabase, isConfigured } from "../lib/supabase.js";
import { AsyncForm, Field, Button, Notice } from "./ui.jsx";

export default function Auth({ onDemo, initialError = "", onRetry }) {
  const [mode, setMode] = useState("login"),
    [message, setMessage] = useState("");
  return (
    <div className="auth-layout">
      <section className="auth-story">
        <a className="brand" href="#">
          <Leaf />
          wildpass<span>環境アセスメント</span>
        </a>
        <div>
          <p className="eyebrow">FROM FIELDWORK TO CONFIDENCE</p>
          <h1>
            現場の発見を、
            <br />
            確かな報告へ。
          </h1>
          <p className="auth-lead">
            調査の計画から証拠の収集、照査、報告書まで。
            <br />
            チームの仕事を、ひとつの記録につなぐ。
          </p>
          <div className="auth-points">
            <span>
              <Layers3 />
              業務と証拠がつながる
            </span>
            <span>
              <CloudOff />
              電波のない現場でも記録
            </span>
            <span>
              <ShieldCheck />
              照査と変更履歴を残す
            </span>
          </div>
        </div>
        <p className="auth-foot">WILDPASS WORKSPACE · JAPAN</p>
      </section>
      <section className="auth-form">
        <div className="auth-card">
          <p className="eyebrow">YOUR WORKSPACE</p>
          <h2>
            {mode === "signup"
              ? "ワークスペースへの登録"
              : mode === "reset"
                ? "パスワードを再設定"
                : "おかえりなさい"}
          </h2>
          <p>チームの環境アセスメントを、ここから。</p>
          {initialError && (
            <Notice tone="warning">
              {initialError}
              {onRetry && <Button onClick={onRetry}>接続を再試行</Button>}
            </Notice>
          )}
          {message && <Notice>{message}</Notice>}
          <AsyncForm
            submitLabel={
              mode === "signup"
                ? "登録する"
                : mode === "reset"
                  ? "再設定メールを送信"
                  : "ログイン"
            }
            onSubmit={async (values) => {
              if (!isConfigured)
                throw new Error(
                  "接続先が設定されていません。管理者に連絡してください。",
                );
              if (mode === "login") {
                const { error } = await supabase.auth.signInWithPassword({
                  email: values.email,
                  password: values.password,
                });
                if (error)
                  throw new Error(
                    "ログインできませんでした。メールアドレス・パスワードと接続状態を確認してください。",
                  );
              }
              if (mode === "signup") {
                const { error } = await supabase.auth.signUp({
                  email: values.email,
                  password: values.password,
                  options: {
                    data: { name: values.name, company: values.company },
                    emailRedirectTo: location.origin + import.meta.env.BASE_URL,
                  },
                });
                if (error) throw error;
                setMessage(
                  "確認メールを送信しました。招待済みのアドレスで登録すると、その組織に参加します。",
                );
              }
              if (mode === "reset") {
                const { error } = await supabase.auth.resetPasswordForEmail(
                  values.email,
                  { redirectTo: location.origin + import.meta.env.BASE_URL },
                );
                if (error) throw error;
                setMessage(
                  "該当するアカウントがあれば、再設定メールが届きます。",
                );
              }
            }}
          >
            {mode === "signup" && (
              <>
                <Field
                  label="お名前"
                  name="name"
                  required
                  autoComplete="name"
                />
                <Field label="会社名" name="company" required />
              </>
            )}
            <Field
              label="メールアドレス"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="name@company.co.jp"
              required
            />
            {mode !== "reset" && (
              <Field
                label="パスワード"
                type="password"
                name="password"
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                minLength={mode === "signup" ? 12 : undefined}
                required
              />
            )}
          </AsyncForm>
          <div className="auth-links">
            <button
              onClick={() => {
                setMode(mode === "login" ? "signup" : "login");
                setMessage("");
              }}
            >
              {mode === "login" ? "招待を受けた方・新規登録" : "ログインに戻る"}
            </button>
            {mode === "login" && (
              <button onClick={() => setMode("reset")}>
                パスワードを忘れた
              </button>
            )}
          </div>
          <div className="demo-entry">
            <span>まず、仕事の流れを試してみる</span>
            <Button icon={ArrowUpRight} onClick={onDemo}>
              デモを開く
            </Button>
            <small>サンプル専用の端末内ワークスペースです。</small>
          </div>
        </div>
      </section>
    </div>
  );
}
