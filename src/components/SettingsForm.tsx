import { useState } from "react";
import { WarehouseClient } from "../warehouse/warehouseClient";
import { saveWarehouseConfig, WarehouseConfig } from "../warehouse/warehouseConfig";

type Props = {
  initial?: WarehouseConfig;
  onSaved: (config: WarehouseConfig) => void;
};

export function SettingsForm({ initial, onSaved }: Props) {
  const [host, setHost] = useState(initial?.host ?? "https://fs-warehouse.tanserver.uk");
  const [apiToken, setApiToken] = useState(initial?.apiToken ?? "");
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const client = new WarehouseClient({ host, apiToken });
    const result = await client.testConnection();
    setTestResult(result.ok ? "Connected" : `Failed: ${result.message}`);
    setTesting(false);
  };

  const save = () => {
    const config = { host, apiToken };
    saveWarehouseConfig(config);
    onSaved(config);
  };

  return (
    <div className="settings-form">
      <label>
        <span className="label">Warehouse Host</span>
        <input value={host} onChange={(e) => setHost(e.target.value)} />
      </label>

      <label>
        <span className="label">API Token</span>
        <div className="token-row">
          <input
            type={showToken ? "text" : "password"}
            value={apiToken}
            onChange={(e) => setApiToken(e.target.value)}
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
        <button type="button" onClick={save} disabled={!host || !apiToken}>
          Save
        </button>
      </div>
    </div>
  );
}
