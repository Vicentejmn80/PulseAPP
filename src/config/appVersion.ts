declare const __RUSHER_COMMIT__: string;
declare const __RUSHER_BUILT_AT__: string;

export function appVersionLabel() {
  const commit = typeof __RUSHER_COMMIT__ === "string" ? __RUSHER_COMMIT__ : "local";
  const built = typeof __RUSHER_BUILT_AT__ === "string" ? __RUSHER_BUILT_AT__ : "";
  return `${commit}${built ? ` · ${built}` : ""}`;
}
