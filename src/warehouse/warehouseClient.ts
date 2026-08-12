import axios, { AxiosInstance } from "axios";
import type { WarehouseConfig } from "./warehouseConfig";

/**
 * Matches the shape of a Forge Steel Hero object closely enough for our
 * purposes — we only read/write the state fields we sync, and round-trip
 * everything else untouched via GET-modify-PUT (see putHeroState below).
 */
export type HeroSummary = { id: string; name: string };

export type HeroStateFields = {
  staminaDamage: number;
  staminaTemp: number;
  recoveriesUsed: number;
  surges: number;
};

export class WarehouseClient {
  private api: AxiosInstance;
  private jwt: string | null = null;

  constructor(private config: WarehouseConfig) {
    this.api = axios.create({ baseURL: config.host });

    this.api.interceptors.request.use(async (req) => {
      if (this.jwt === null) await this.authenticate();
      req.headers.Authorization = `Bearer ${this.jwt}`;
      return req;
    });
  }

  private async authenticate(): Promise<void> {
    const response = await axios.post(
      `${this.config.host}/connect`,
      {},
      { headers: { Authorization: `Bearer ${this.config.apiToken}` } }
    );
    this.jwt = response.data.access_token;
  }

  /** Cheap authenticated call for the settings form's "Test Connection" button. */
  async testConnection(): Promise<{ ok: true } | { ok: false; message: string }> {
    try {
      await this.authenticate();
      await this.api.get("/me");
      return { ok: true };
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? `[${err.response?.status ?? "?"}] ${err.response?.data?.message ?? err.message}`
        : String(err);
      return { ok: false, message };
    }
  }

  /** Lightweight list — matches Forge Steel's own `fields=name,folder` partial-fetch pattern. */
  async getHeroSummaries(): Promise<HeroSummary[]> {
    const response = await this.api.get("/data/forgesteel-heroes", {
      params: { fields: "name" },
    });
    return response.data.data;
  }

  /** Full hero object — required before any write, since Warehouse PUT replaces the whole record. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getFullHero(id: string): Promise<any> {
    const response = await this.api.get(`/data/forgesteel-heroes/${id}`);
    return response.data.data;
  }

  extractStateFields(hero: { state: HeroStateFields }): HeroStateFields {
    return {
      staminaDamage: hero.state.staminaDamage,
      staminaTemp: hero.state.staminaTemp,
      recoveriesUsed: hero.state.recoveriesUsed,
      surges: hero.state.surges,
    };
  }

  /**
   * GET-modify-PUT: fetches the full hero fresh, patches only state fields
   * we own, writes the whole object back. Deliberately NOT safe against a
   * concurrent Forge Steel edit landing between the GET and the PUT — see
   * the race-condition note in the README before enabling live (non
   * session-start-only) sync.
   */
  async patchHeroState(id: string, patch: Partial<HeroStateFields>): Promise<void> {
    const hero = await this.getFullHero(id);
    hero.state = { ...hero.state, ...patch };
    await this.api.put(`/data/forgesteel-heroes/${id}`, hero);
  }
}
