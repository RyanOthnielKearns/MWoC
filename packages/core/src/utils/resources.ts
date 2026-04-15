import type { Resource, RemoteServer } from "../types.js";

export function getResourceLabel(resource: Resource): string {
  if (resource.type === "local") {
    return (resource as any).endpoint;
  }
  if (resource.type === "server") {
    const srv = resource as RemoteServer;
    if (srv.accessMethod === "ssh-tunnel" && srv.sshHost) {
      return srv.sshHost;
    }
    return srv.endpoint;
  }
  if (resource.type === "cloud") {
    const res = resource as any;
    return res.webOnly ? `${res.provider} (web only)` : res.provider;
  }
  return "unknown";
}

export function getResourceTypeLabel(resource: Resource): string {
  if (resource.type === "server") return "server";
  if (resource.type === "cloud" && (resource as any).webOnly) return "web sub";
  return resource.type;
}
