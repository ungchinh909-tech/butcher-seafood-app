import { Firestore } from "@google-cloud/firestore";
import * as fs from "fs";
import * as path from "path";

// Define structures
export interface Butcher {
  id: string;
  name: string;
  pin: string;
  status: "Hoạt động" | "Khóa";
  createdAt: string;
}

export interface ReportRecord {
  id: string;
  seafoodName: string;
  timestamp: string;
  kg: number | null;
  imageData: string;
  butcherName: string;
  butcherPin: string;
  synced: boolean;
  driveUrl?: string;
}

export interface GoogleConfig {
  spreadsheetId: string;
  googleClientId: string;
  googleClientSecret?: string;
  redirectUri: string;
}

let firestore: Firestore | null = null;
let isFirestoreDisabled = false;
let configProject: string | undefined;
let configDatabase: string | undefined;

try {
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    configProject = firebaseConfig.projectId;
    configDatabase = firebaseConfig.firestoreDatabaseId;
    console.log(`Loaded custom Firebase Configuration for server db. Project: ${configProject}, Database: ${configDatabase}`);
  } else {
    if (process.env.USE_FIRESTORE !== "true") {
      isFirestoreDisabled = true;
    }
  }
} catch (e) {
  console.warn("Could not read firebase-applet-config.json:", e);
}

const FALLBACK_DIR = path.join(process.cwd(), "data_fallback");
const BUTCHERS_FILE = path.join(FALLBACK_DIR, "butchers.json");
const CONFIG_FILE = path.join(FALLBACK_DIR, "config.json");
const REPORTS_FILE = path.join(FALLBACK_DIR, "reports.json");
const ADMINS_FILE = path.join(FALLBACK_DIR, "admins.json");

// Ensure fallback folder exists
if (!fs.existsSync(FALLBACK_DIR)) {
  fs.mkdirSync(FALLBACK_DIR, { recursive: true });
}

// Ensure default files exist with seed data
if (!fs.existsSync(BUTCHERS_FILE)) {
  const defaultButchers: Butcher[] = [
    { id: "b1", name: "Butcher A", pin: "1111", status: "Hoạt động", createdAt: new Date().toISOString() },
    { id: "b2", name: "Butcher B", pin: "2222", status: "Hoạt động", createdAt: new Date().toISOString() },
    { id: "b3", name: "Butcher C", pin: "3333", status: "Khóa", createdAt: new Date().toISOString() }
  ];
  fs.writeFileSync(BUTCHERS_FILE, JSON.stringify(defaultButchers, null, 2), "utf8");
}
if (!fs.existsSync(CONFIG_FILE)) {
  const defaultConfig: GoogleConfig = {
    spreadsheetId: "",
    googleClientId: "1053715373630-jt15fc2au8ufj1jfbth3hegrmmnflqg7.apps.googleusercontent.com",
    googleClientSecret: "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",
    redirectUri: ""
  };
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(defaultConfig, null, 2), "utf8");
}
if (!fs.existsSync(REPORTS_FILE)) {
  fs.writeFileSync(REPORTS_FILE, "[]", "utf8");
}
if (!fs.existsSync(ADMINS_FILE)) {
  const defaultAdmins: AdminRecord[] = [
    {
      email: "admin@butcher.com",
      password: "admin123",
      addedAt: new Date().toISOString()
    },
    {
      email: "ungchinh909@gmail.com",
      password: "admin123",
      addedAt: new Date().toISOString()
    }
  ];
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(defaultAdmins, null, 2), "utf8");
}

if (!isFirestoreDisabled) {
  try {
    // Pass both projectId and databaseId so the Firestore SDK targets the correctly provisioned user database.
    firestore = new Firestore({
      projectId: configProject,
      databaseId: configDatabase
    });
    console.log(`Firebase/Firestore Admin SDK initialized successfully with project ID: ${configProject}, database ID: ${configDatabase}`);
  } catch (error) {
    console.warn("Could not auto-initialize GCP Firestore. Using file-based backup engine.", error);
    isFirestoreDisabled = true;
  }
} else {
  console.log("Using local file-based backup engine for application database (stored in /data_fallback).");
}

function handleFirestoreError(err: any, context: string) {
  const errMsg = err?.message || String(err);
  if (
    errMsg.includes("PERMISSION_DENIED") ||
    errMsg.includes("API has not been used") ||
    errMsg.includes("disabled") ||
    errMsg.includes("not enabled")
  ) {
    if (!isFirestoreDisabled) {
      console.log(`[Database Fallback] Firestore is disabled or inaccessible (Reason: ${errMsg}). Switched fully to local file-based database fallback.`);
      isFirestoreDisabled = true;
    }
  } else {
    console.warn(`Firestore non-fatal warning during ${context}:`, errMsg);
  }
}

// ---------------- BUTCHERS COLLECTION ----------------
export async function getButchers(): Promise<Butcher[]> {
  if (firestore && !isFirestoreDisabled) {
    try {
      const snapshot = await firestore.collection("butchers").get();
      const list: Butcher[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        list.push({
          id: doc.id,
          name: data.name,
          pin: data.pin,
          status: data.status || "Hoạt động",
          createdAt: data.createdAt || new Date().toISOString()
        });
      });
      if (list.length === 0) {
        // Seed first
        const seed = JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8"));
        for (const b of seed) {
          await firestore.collection("butchers").doc(b.id).set({
            name: b.name,
            pin: b.pin,
            status: b.status,
            createdAt: b.createdAt
          });
          list.push(b);
        }
      }
      return list;
    } catch (err) {
      handleFirestoreError(err, "getButchers");
    }
  }
  return JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8"));
}

export async function saveButcher(butcher: Omit<Butcher, "id" | "createdAt"> & { id?: string }): Promise<Butcher> {
  const id = butcher.id || "b_" + Math.random().toString(36).substring(2, 9);
  const newButcher: Butcher = {
    id,
    name: butcher.name,
    pin: butcher.pin,
    status: butcher.status || "Hoạt động",
    createdAt: new Date().toISOString()
  };

  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("butchers").doc(id).set({
        name: newButcher.name,
        pin: newButcher.pin,
        status: newButcher.status,
        createdAt: newButcher.createdAt
      });
    } catch (err) {
      handleFirestoreError(err, "saveButcher");
    }
  }

  // Always update fallback file to stay synchronized
  const list = JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8")) as Butcher[];
  const existingIdx = list.findIndex(b => b.id === id);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...list[existingIdx], ...newButcher, createdAt: list[existingIdx].createdAt };
  } else {
    list.push(newButcher);
  }
  fs.writeFileSync(BUTCHERS_FILE, JSON.stringify(list, null, 2), "utf8");
  return newButcher;
}

export async function updateButcherStatus(id: string, status: "Hoạt động" | "Khóa"): Promise<void> {
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("butchers").doc(id).update({ status });
    } catch (err) {
      handleFirestoreError(err, "updateButcherStatus");
    }
  }
  const list = JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8")) as Butcher[];
  const existing = list.find(b => b.id === id);
  if (existing) {
    existing.status = status;
    fs.writeFileSync(BUTCHERS_FILE, JSON.stringify(list, null, 2), "utf8");
  }
}

export async function updateButcherPin(id: string, pin: string): Promise<void> {
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("butchers").doc(id).update({ pin });
    } catch (err) {
      handleFirestoreError(err, "updateButcherPin");
    }
  }
  const list = JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8")) as Butcher[];
  const existing = list.find(b => b.id === id);
  if (existing) {
    existing.pin = pin;
    fs.writeFileSync(BUTCHERS_FILE, JSON.stringify(list, null, 2), "utf8");
  }
}

export async function deleteButcher(id: string): Promise<void> {
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("butchers").doc(id).delete();
    } catch (err) {
      handleFirestoreError(err, "deleteButcher");
    }
  }
  const list = JSON.parse(fs.readFileSync(BUTCHERS_FILE, "utf8")) as Butcher[];
  const newList = list.filter(b => b.id !== id);
  fs.writeFileSync(BUTCHERS_FILE, JSON.stringify(newList, null, 2), "utf8");
}

export interface AdminRecord {
  email: string;
  password?: string;
  addedAt: string;
}

export async function getAdmins(): Promise<AdminRecord[]> {
  if (firestore && !isFirestoreDisabled) {
    try {
      const snapshot = await firestore.collection("admins").get();
      const list: AdminRecord[] = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        list.push({
          email: doc.id,
          password: data.password || "admin123",
          addedAt: data.addedAt || new Date().toISOString()
        });
      });
      if (list.length === 0) {
        // Seed
        const seed = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8")) as AdminRecord[];
        for (const record of seed) {
          await firestore.collection("admins").doc(record.email).set({
            password: record.password || "admin123",
            addedAt: record.addedAt || new Date().toISOString()
          });
          list.push(record);
        }
      }
      return list;
    } catch (err) {
      handleFirestoreError(err, "getAdmins");
    }
  }
  return JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8"));
}

export async function addAdmin(email: string, password = "admin123"): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const addedAt = new Date().toISOString();
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("admins").doc(cleanEmail).set({ password, addedAt });
    } catch (err) {
      handleFirestoreError(err, "addAdmin");
    }
  }
  const auds = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8")) as AdminRecord[];
  if (!auds.some(e => e.email.toLowerCase() === cleanEmail)) {
    auds.push({ email: cleanEmail, password, addedAt });
    fs.writeFileSync(ADMINS_FILE, JSON.stringify(auds, null, 2), "utf8");
  }
}

export async function removeAdmin(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("admins").doc(cleanEmail).delete();
    } catch (err) {
      handleFirestoreError(err, "removeAdmin");
    }
  }
  const auds = JSON.parse(fs.readFileSync(ADMINS_FILE, "utf8")) as AdminRecord[];
  const nextAdmins = auds.filter(e => e.email.toLowerCase() !== cleanEmail);
  fs.writeFileSync(ADMINS_FILE, JSON.stringify(nextAdmins, null, 2), "utf8");
}

// ---------------- CONFIG SYSTEM ----------------
export async function getGoogleConfig(): Promise<GoogleConfig> {
  if (firestore && !isFirestoreDisabled) {
    try {
      const doc = await firestore.collection("config").doc("google_sheets").get();
      if (doc.exists) {
        const data = doc.data() as any;
        return {
          spreadsheetId: data.spreadsheetId || "",
          googleClientId: data.googleClientId || "1053715373630-jt15fc2au8ufj1jfbth3hegrmmnflqg7.apps.googleusercontent.com",
          googleClientSecret: data.googleClientSecret || "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",
          redirectUri: data.redirectUri || ""
        };
      } else {
        const seed = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8")) as GoogleConfig;
        await firestore.collection("config").doc("google_sheets").set(seed);
        return seed;
      }
    } catch (err) {
      handleFirestoreError(err, "getGoogleConfig");
    }
  }
  return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
}

export async function saveGoogleConfig(config: GoogleConfig): Promise<void> {
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("config").doc("google_sheets").set(config);
    } catch (err) {
      handleFirestoreError(err, "saveGoogleConfig");
    }
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

// ---------------- WEIGHING REPORT SYSTEM ----------------
export async function saveReport(record: ReportRecord): Promise<void> {
  if (firestore && !isFirestoreDisabled) {
    try {
      await firestore.collection("reports").doc(record.id).set(record);
    } catch (err) {
      handleFirestoreError(err, "saveReport");
    }
  }
  // Fallback json update
  const list = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8")) as ReportRecord[];
  const existingIdx = list.findIndex(r => r.id === record.id);
  if (existingIdx >= 0) {
    list[existingIdx] = record;
  } else {
    list.push(record);
  }
  fs.writeFileSync(REPORTS_FILE, JSON.stringify(list, null, 2), "utf8");
}

export async function getReports(): Promise<ReportRecord[]> {
  if (firestore && !isFirestoreDisabled) {
    try {
      const snapshot = await firestore.collection("reports").orderBy("timestamp", "desc").limit(300).get();
      const list: ReportRecord[] = [];
      snapshot.forEach(doc => {
        list.push(doc.data() as ReportRecord);
      });
      return list;
    } catch (err) {
      handleFirestoreError(err, "getReports");
    }
  }
  const local = JSON.parse(fs.readFileSync(REPORTS_FILE, "utf8")) as ReportRecord[];
  local.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  return local;
}
