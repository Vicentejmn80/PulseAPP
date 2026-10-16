import { explainNotificationError } from "@/lib/notificationInbox";
import { callRpc, readSessionToken } from "@/services/accountApi";

export type AppNotification = {
  id: string;
  tipo: string;
  title: string;
  body: string;
  datos: {
    partidoId?: string;
    silenciosa?: boolean;
    puntos?: number;
  };
  read: boolean;
  createdAt: string;
};

type ListResult = {
  ok?: boolean;
  error?: string;
  unread?: number;
  items?: AppNotification[];
};

export async function listNotifications(offset = 0) {
  try {
    const result = await callRpc<ListResult>("pulse_notifications_list", {
      p_token: readSessionToken(),
      p_limit: 20,
      p_offset: offset,
    });
    if (!result || result.ok === false) {
      throw new Error(explainNotificationError(result?.error ?? "", "No se pudieron cargar los avisos."));
    }
    return { unread: result.unread ?? 0, items: result.items ?? [] };
  } catch (error: unknown) {
    throw new Error(explainNotificationError(error instanceof Error ? error.message : "", "No se pudieron cargar los avisos."));
  }
}

export async function markNotificationRead(id: string) {
  await callRpc("pulse_notifications_read", { p_token: readSessionToken(), p_id: id });
}

export async function markAllNotificationsRead() {
  try {
    const result = await callRpc<{ ok?: boolean; error?: string }>("pulse_notifications_read_all", {
      p_token: readSessionToken(),
    });
    if (!result || result.ok !== true) {
      throw new Error(explainNotificationError(result?.error ?? "", "No se pudieron marcar los avisos."));
    }
  } catch (error: unknown) {
    throw new Error(explainNotificationError(error instanceof Error ? error.message : "", "No se pudieron marcar los avisos."));
  }
}
