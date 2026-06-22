import { apiFetch } from "./api";

export interface DeviceInfo {
  id: string;
  label: string;
  user_agent: string;
  created_at: string;
  last_seen_at: string;
  last_synced_at: string | null;
}

/** Fetch the devices that have used this account, most-recently-seen first. */
export async function apiGetDevices(): Promise<DeviceInfo[]> {
  const res = await apiFetch<{ devices: DeviceInfo[] }>("/api/devices");
  return res.devices ?? [];
}
