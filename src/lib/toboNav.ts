/** In-experience back target. Leaving Juégate el Tobo is a separate action. */
export function predictionBackTarget() {
  return "/tobo";
}

export function toboExitTarget() {
  return "/";
}

export function isToboPath(pathname: string) {
  return pathname === "/tobo" || pathname.startsWith("/tobo/");
}

export function isPredictionPath(pathname: string) {
  return /^\/tobo\/partidos\/[^/]+$/.test(pathname);
}
