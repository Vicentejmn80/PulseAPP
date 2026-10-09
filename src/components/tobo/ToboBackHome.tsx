import { useNavigate } from "react-router-dom";

export function ToboBackHome() {
  const navigate = useNavigate();
  return (
    <button
      type="button"
      onClick={() => navigate("/tobo")}
      className="flex min-h-11 w-full items-center justify-center rounded-[14px] px-3 text-[13px] font-extrabold"
      style={{ backgroundColor: "rgba(255,255,255,0.06)", color: "var(--t-text)", border: "1px solid var(--t-border)" }}
    >
      ← Volver al inicio de Juégate el Tobo
    </button>
  );
}
