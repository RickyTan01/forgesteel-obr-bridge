import { useState } from "react";
import { WarehouseClient } from "../warehouse/warehouseClient";
import { saveWarehouseConfig, WarehouseConfig } from "../warehouse/warehouseConfig";
import {
  ConnectionProfile,
  deleteConnectionProfile,
  getConnectionProfiles,
  upsertConnectionProfile,
} from "../warehouse/connectionProfiles";

type Props = {
  initial?: WarehouseConfig;
  onSaved: (config: WarehouseConfig) => void;
};

export function SettingsForm({ initial, onSaved }: Props) {
  const [host, setHost] = useState(initial?.host ?? "");
  const [apiToken, setApiToken] = useState(initial?.apiToken ?? "");
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  // Set only by a successful Test Connection, cleared on any edit to
  // host/token or a profile switch — "Save as Campaign" is only enabled
  // while this reflects the form's current contents.
  const [connectedUsername, setConnectedUsername] = useState<string | null>(null);
  const [profiles, setProfiles] = useState<ConnectionProfile[]>(() => getConnectionProfiles());
  const [profileStatus, setProfileStatus] = useState<string | null>(null);

  const changeHost = (value: string) => {
    setHost(value);
    setConnectedUsername(null);
  };

  const changeApiToken = (value: string) => {
    setApiToken(value);
    setConnectedUsername(null);
  };

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    setConnectedUsername(null);
    const client = new WarehouseClient({ host, apiToken });
    const result = await client.testConnection();
    if (result.ok) {
      setTestResult(`Connected to ${result.username}`);
      setConnectedUsername(result.username);
    } else {
      setTestResult(`Failed: ${result.message}`);
    }
    setTesting(false);
  };

  const save = () => {
    const config = { host, apiToken };
    saveWarehouseConfig(config);
    onSaved(config);
  };

  const saveAsProfile = () => {
    if (!connectedUsername) return;
    upsertConnectionProfile({ name: connectedUsername, host, apiToken });
    setProfiles(getConnectionProfiles());
    setProfileStatus(`Saved campaign "${connectedUsername}"`);
  };

  const switchProfile = (id: string) => {
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return;
    setHost(profile.host);
    setApiToken(profile.apiToken);
    setTestResult(null);
    setConnectedUsername(null);
    setProfileStatus(null);
  };

  const removeProfile = (profile: ConnectionProfile) => {
    if (!window.confirm(`Remove the saved campaign "${profile.name}"?`)) return;
    deleteConnectionProfile(profile.id);
    setProfiles(getConnectionProfiles());
  };

  return (
    <div className="settings-form">
      <label>
        <span className="label">Warehouse Host</span>
        <input
          value={host}
          onChange={(e) => changeHost(e.target.value)}
          placeholder="fs-warehouse address"
        />
      </label>

      <label>
        <span className="label">API Token</span>
        <div className="token-row">
          <input
            type={showToken ? "text" : "password"}
            value={apiToken}
            onChange={(e) => changeApiToken(e.target.value)}
          />
          <button type="button" onClick={() => setShowToken((s) => !s)}>
            {showToken ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {testResult && <div className="test-result">{testResult}</div>}

      <div className="actions">
        <button type="button" onClick={test} disabled={testing || !host || !apiToken}>
          {testing ? "Testing…" : "Test Connection"}
        </button>
        <button type="button" onClick={saveAsProfile} disabled={!connectedUsername}>
          Save as Campaign
        </button>
        <button type="button" onClick={save} disabled={!host || !apiToken}>
          Save
        </button>
      </div>

      {profileStatus && <div className="test-result">{profileStatus}</div>}

      {profiles.length > 0 && (
        <label>
          <span className="label">Switch Campaign</span>
          <select
            value=""
            onChange={(e) => {
              const id = e.target.value;
              if (id) switchProfile(id);
            }}
          >
            <option value="" disabled>
              Select a saved campaign…
            </option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {profiles.length > 0 && (
        <label>
          <span className="label">Manage Saved Campaigns</span>
          <div className="profile-list">
            {profiles.map((p) => (
              <div className="profile-row" key={p.id}>
                <span>{p.name}</span>
                <button type="button" className="link-clear" onClick={() => removeProfile(p)}>
                  Delete
                </button>
              </div>
            ))}
          </div>
        </label>
      )}
    </div>
  );
}
