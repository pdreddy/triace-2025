// One compact sign-in card shared by the admin and captain pages: logo and title on one line, short intro, the form.
export default function AuthCard({ eyebrow, title, intro, children, footer }) {
  return (
    <section className="page auth-screen">
      <div className="auth-card">
        <header className="auth-head">
          <img className="auth-logo" src="/traice-tennis.webp" alt="" width="52" height="52" />
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
        </header>
        {intro && <p className="auth-intro">{intro}</p>}
        {children}
        {footer && <p className="auth-foot small">{footer}</p>}
      </div>
    </section>
  );
}
