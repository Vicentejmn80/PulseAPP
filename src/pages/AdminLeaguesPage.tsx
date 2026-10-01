import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { BackButton } from "@/components/ui/Buttons";
import { storedAdminKey } from "@/lib/adminKey";
import { listAllLeaguesAdmin, type League } from "@/services/leaguesApi";

export function AdminLeaguesPage() {
  const navigate = useNavigate();
  const adminKey = storedAdminKey();
  const [leagues, setLeagues] = useState<League[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!adminKey) return;
    let alive = true;
    listAllLeaguesAdmin(adminKey)
      .then((rows) => {
        if (alive) setLeagues(rows);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : "No se pudieron cargar las ligas.");
      });
    return () => {
      alive = false;
    };
  }, [adminKey]);

  if (!adminKey) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <p className="text-[16px] font-extrabold">Necesitas clave de admin</p>
        <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Ingresa desde el perfil con una clave valida.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pb-2 pt-[max(1rem,env(safe-area-inset-top))]">
        <BackButton onClick={() => navigate("/profile")} />
        <div>
          <p className="text-[12px] font-extrabold uppercase tracking-[0.14em] text-[#FF4F1A]">Super Admin</p>
          <h2 className="text-[24px] font-extrabold tracking-tight">Ligas</h2>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {error && <p className="mb-3 rounded-2xl bg-white px-4 py-3 text-[13px] font-bold text-[#E23B2F]">{error}</p>}

        <div className="flex flex-col gap-2">
          {leagues.map((league) => (
            <div key={league.id} className="rounded-[24px] bg-white px-4 py-4">
              <div className="flex items-center justify-between">
                <p className="text-[16px] font-extrabold">{league.name}</p>
                <span className="rounded-full bg-[#FFF1EA] px-2 py-1 text-[11px] font-extrabold text-[#FF4F1A]">{league.memberCount} miembros</span>
              </div>
              <p className="mt-1 text-[13px] font-semibold text-[#8D7366]">Codigo: {league.code}</p>
              <p className="text-[12px] font-semibold text-[#A08B80]">Owner: {league.ownerUserId}</p>
            </div>
          ))}
          {leagues.length === 0 && <p className="text-center text-[14px] font-semibold text-[#8D7366]">No hay ligas creadas.</p>}
        </div>
      </div>
    </div>
  );
}
