type Mode = "login" | "register";

type LoginForm = { userId: string };
type RegisterForm = { userId: string; displayName: string };

type Props = {
  mode: Mode;
  setMode: (m: Mode) => void;
  busy: boolean;
  toast: string | null;

  login: LoginForm;
  setLogin: (v: LoginForm) => void;
  loginErr: string | null;

  rememberUserId: boolean;
  setRememberUserId: (v: boolean) => void;

  reg: RegisterForm;
  setReg: (updater: RegisterForm | ((prev: RegisterForm) => RegisterForm)) => void;
  regUserIdErr: string | null;
  regNameErr: string | null;

  agreeNoRecovery: boolean;
  setAgreeNoRecovery: (v: boolean) => void;

  onLogin: () => void;
  onRegister: () => void;
};

export function AuthScreen(props: Props) {
  const {
    mode,
    setMode,
    busy,
    toast,
    login,
    setLogin,
    loginErr,
    rememberUserId,
    setRememberUserId,
    reg,
    setReg,
    regUserIdErr,
    regNameErr,
    agreeNoRecovery,
    setAgreeNoRecovery,
    onLogin,
    onRegister,
  } = props;

  return (
    <>
      <header className="topbar authTopbar">
        <div className="brand">
          <div className="logo">YR</div>
          <div>
            <div className="title">YuiRoom</div>
          </div>
        </div>
      </header>

      <main className="card">
        <div className="cardTop">
          <div className="seg">
            <button
              className={`segBtn ${mode === "login" ? "active" : ""}`}
              onClick={() => setMode("login")}
              disabled={busy}
            >
              ログイン
            </button>
            <button
              className={`segBtn ${mode === "register" ? "active" : ""}`}
              onClick={() => setMode("register")}
              disabled={busy}
            >
              新規登録
            </button>
          </div>
        </div>

        <div key={mode} className="panel">
          {mode === "login" ? (
            <>
              <h1>ログイン</h1>
              <p className="desc">ユーザーIDを入力して、パスキーで認証します。</p>

              <label className="label">
                ユーザーID（重複不可・変更可）
                <input
                  className={`input ${loginErr ? "bad" : ""}`}
                  value={login.userId}
                  onChange={(e) => setLogin({ userId: e.target.value })}
                  placeholder="例: user_id"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
                {loginErr ? (
                  <div className="hint badText">{loginErr}</div>
                ) : (
                  <div className="hint">a-z / 0-9 / _ / - のみ（3〜32文字）</div>
                )}
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={rememberUserId}
                  onChange={(e) => setRememberUserId(e.target.checked)}
                  disabled={busy}
                />
                <span>この端末にユーザーIDを保存する</span>
              </label>

              <button className="primary" onClick={onLogin} disabled={busy || !!loginErr}>
                {busy ? "認証中…" : "パスキーでログイン"}
              </button>
            </>
          ) : (
            <>
              <h1>新規登録</h1>
              <p className="desc">ユーザーIDとユーザー名を設定して、パスキーを登録します。</p>

              <label className="label">
                ユーザーID（重複不可・変更可）
                <input
                  className={`input ${regUserIdErr ? "bad" : ""}`}
                  value={reg.userId}
                  onChange={(e) => setReg((p) => ({ ...p, userId: e.target.value }))}
                  placeholder="例: user_id"
                  autoCapitalize="off"
                  autoCorrect="off"
                  spellCheck={false}
                  disabled={busy}
                />
                {regUserIdErr ? (
                  <div className="hint badText">{regUserIdErr}</div>
                ) : (
                  <div className="hint">a-z / 0-9 / _ / - のみ（3〜32文字）</div>
                )}
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={rememberUserId}
                  onChange={(e) => setRememberUserId(e.target.checked)}
                  disabled={busy}
                />
                <span>この端末にユーザーIDを保存する</span>
              </label>

              <label className="label">
                ユーザー名（表示名・日本語OK・重複OK）
                <input
                  className={`input ${regNameErr ? "bad" : ""}`}
                  value={reg.displayName}
                  onChange={(e) => setReg((p) => ({ ...p, displayName: e.target.value }))}
                  placeholder="例: user_name"
                  disabled={busy}
                />
                {regNameErr ? (
                  <div className="hint badText">{regNameErr}</div>
                ) : (
                  <div className="hint">1〜32文字、改行なし</div>
                )}
              </label>

              <label className="check">
                <input
                  type="checkbox"
                  checked={agreeNoRecovery}
                  onChange={(e) => setAgreeNoRecovery(e.target.checked)}
                  disabled={busy}
                />
                <span>パスキーを失うと復旧できないことを理解しました（同意）</span>
              </label>

              <button
                className="primary"
                onClick={onRegister}
                disabled={busy || !!regUserIdErr || !!regNameErr || !agreeNoRecovery}
              >
                {busy ? "登録中…" : "パスキーを登録してはじめる"}
              </button>
            </>
          )}
        </div>

        {toast && <div className="toast">{toast}</div>}
      </main>
    </>
  );
}

