import * as lancedb from '@lancedb/lancedb';
import * as path from 'path';
import * as fs from 'fs';

export interface SkillData {
  id: string;
  name: string;
  description: string;
  intents?: string[];
}

export interface IntentData {
  text: string;
  agent: string;
}

export interface ToolData {
  name: string;
  description: string;
  metadata?: string;
}

type SkillVectorRecord = {
  vector: number[];
  id: string;
  name: string;
  description: string;
  text_content: string;
};

type IntentVectorRecord = {
  vector: number[];
  text_content: string;
  agent: string;
};

export class VectorDB {
  private static instance: VectorDB;
  private db: lancedb.Connection | null = null;
  private dbPath: string;

  private constructor() {
    const dataDir = process.env.MOMAI_DATA_DIR;
    if (dataDir) {
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }
      this.dbPath = path.join(dataDir, 'momai_vectors.db');
    } else {
      this.dbPath = path.join(process.cwd(), 'momai_vectors.db');
    }
  }

  public static getInstance(): VectorDB {
    if (!VectorDB.instance) {
      VectorDB.instance = new VectorDB();
    }
    return VectorDB.instance;
  }

  private async connect(): Promise<lancedb.Connection> {
    if (!this.db) {
      this.db = await lancedb.connect(this.dbPath);
    }
    return this.db;
  }

  private async getTable(name: string): Promise<lancedb.Table> {
    const db = await this.connect();
    const tables = await db.tableNames();
    if (tables.includes(name)) {
      return await db.openTable(name);
    }
    throw new Error(`Table ${name} does not exist.`);
  }

  private async createTable(name: string, data: any[]): Promise<lancedb.Table> {
    const db = await this.connect();
    return await db.createTable(name, data, { mode: 'overwrite' });
  }

  private async embedText(text: string): Promise<number[]> {
    console.log(`[VectorDB] Embedding text: ${text.slice(0, 20)}...`);
    return new Array(1024).fill(0).map(() => Math.random());
  }

  public async searchIntents(query: string, limit: number = 1): Promise<any[]> {
    try {
      const table = await this.getTable('intents');
      const vector = await this.embedText(query);
      const results = await table.vectorSearch(vector).distanceType('cosine').limit(limit).toArray();
      return results;
    } catch (error) {
      console.error('[VectorDB] Search intents error:', error);
      return [];
    }
  }

  public async searchSkills(query: string, limit: number = 3): Promise<any[]> {
    try {
      const table = await this.getTable('skills');
      const vector = await this.embedText(query);
      const results = await table.vectorSearch(vector).distanceType('cosine').limit(limit).toArray();
      return results;
    } catch (error) {
      console.error('[VectorDB] Search skills error:', error);
      return [];
    }
  }

  public async addSkills(skillsData: SkillData[]): Promise<void> {
    if (!skillsData.length) return;

    const dataWithVectors: SkillVectorRecord[] = [];
    for (const item of skillsData) {
      const textsToIndex = item.intents?.length ? item.intents : [item.description || item.name || 'skill'];
      for (const text of textsToIndex) {
        const vector = await this.embedText(text);
        dataWithVectors.push({
          vector,
          id: item.id,
          name: item.name,
          description: item.description,
          text_content: text
        });
      }
    }

    if (dataWithVectors.length) {
      await this.createTable('skills', dataWithVectors);
    }
  }

  public async addIntents(intentsData: IntentData[]): Promise<void> {
    if (!intentsData.length) return;

    const dataWithVectors: IntentVectorRecord[] = [];
    for (const item of intentsData) {
      const vector = await this.embedText(item.text);
      dataWithVectors.push({
        vector,
        text_content: item.text,
        agent: item.agent
      });
    }

    if (dataWithVectors.length) {
      await this.createTable('intents', dataWithVectors);
    }
  }
}

export const vectorDB = VectorDB.getInstance();
