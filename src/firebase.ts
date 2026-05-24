import { type ClassValue } from 'clsx';

// --- Reusable Timestamp Implementation ---
export class Timestamp {
  constructor(public seconds: number, public nanoseconds: number) {}
  
  static now() {
    const ms = Date.now();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }
  
  static fromDate(date: Date) {
    const ms = date.getTime();
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }
  
  static fromMillis(ms: number) {
    return new Timestamp(Math.floor(ms / 1000), (ms % 1000) * 1000000);
  }
  
  toDate() {
    return new Date(this.seconds * 1000 + Math.floor(this.nanoseconds / 1000000));
  }
  
  valueOf() {
    return this.seconds * 1000;
  }
}

// --- Serializers / Deserializers for local-first storage ---
function serialize(val: any): any {
  if (val === null || val === undefined) return val;
  if (val instanceof Timestamp) {
    return { _isTimestamp: true, seconds: val.seconds, nanoseconds: val.nanoseconds };
  }
  if (val instanceof Date) {
    const ts = Timestamp.fromDate(val);
    return { _isTimestamp: true, seconds: ts.seconds, nanoseconds: ts.nanoseconds };
  }
  if (val && val._isIncrement) return val;
  if (val && val._isDeleteField) return val;
  if (Array.isArray(val)) {
    return val.map(serialize);
  }
  if (typeof val === 'object') {
    const res: any = {};
    for (const key of Object.keys(val)) {
      res[key] = serialize(val[key]);
    }
    return res;
  }
  return val;
}

function deserialize(val: any): any {
  if (val === null || val === undefined) return val;
  if (typeof val === 'object') {
    if (val._isTimestamp) {
      return new Timestamp(val.seconds, val.nanoseconds);
    }
    if (Array.isArray(val)) {
      return val.map(deserialize);
    }
    const res: any = {};
    for (const key of Object.keys(val)) {
      res[key] = deserialize(val[key]);
    }
    return res;
  }
  if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(val)) {
    const d = new Date(val);
    if (!isNaN(d.getTime())) {
      return Timestamp.fromDate(d);
    }
  }
  return val;
}

// Helper to resolve nested fields
function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const p of parts) {
    if (current === null || typeof current !== 'object') return undefined;
    current = current[p];
  }
  return current;
}

function setNestedValue(obj: any, path: string, value: any) {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const p = parts[i];
    if (!(p in current) || typeof current[p] !== 'object' || current[p] === null) {
      current[p] = {};
    }
    current = current[p];
  }
  const lastKey = parts[parts.length - 1];
  
  if (value && value._isIncrement) {
    const currentVal = typeof current[lastKey] === 'number' ? current[lastKey] : 0;
    current[lastKey] = currentVal + value.value;
  } else if (value && value._isDeleteField) {
    delete current[lastKey];
  } else {
    current[lastKey] = value;
  }
}

// --- App Mock ---
const appInstance = { name: '[MockApp]' };
const apps = [appInstance];

export function initializeApp(config?: any, name?: string) {
  if (name) {
    const existing = apps.find(a => a.name === name);
    if (existing) return existing;
    const newApp = { name };
    apps.push(newApp);
    return newApp;
  }
  return appInstance;
}
export function getApp(name?: string) {
  if (name) {
    return apps.find(a => a.name === name) || appInstance;
  }
  return appInstance;
}
export function getApps() {
  return apps;
}

// --- Auth implementation ---
export interface User {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  isAnonymous: boolean;
  tenantId: string | null;
}

const authListeners = new Set<(user: any) => void>();

class MockAuth {
  private _currentUser: User | null = null;
  
  constructor() {
    const saved = localStorage.getItem('hortamanager_auth_current_user');
    if (saved) {
      try { this._currentUser = JSON.parse(saved); } catch (e) {}
    }
    const usersStr = localStorage.getItem('hortamanager_auth_users');
    if (!usersStr) {
      const initialUsers = [
        { uid: 'uid_lucas', email: 'lucas@hortamanager.com', displayName: 'Lucas', password: 'Lgf091723' },
        { uid: 'uid_lucas_gmail', email: 'lucasfucilini3@gmail.com', displayName: 'Lucas Fucilini', password: 'Lgf091723' }
      ];
      localStorage.setItem('hortamanager_auth_users', JSON.stringify(initialUsers));
    }
  }
  
  get currentUser() { return this._currentUser; }
  
  setCurrentUser(user: User | null) {
    this._currentUser = user;
    if (user) {
      localStorage.setItem('hortamanager_auth_current_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('hortamanager_auth_current_user');
    }
    authListeners.forEach(cb => { try { cb(user); } catch (e) {} });
  }
}

const mockAuthInstances = new Map<string, MockAuth>();
const primaryAuth = new MockAuth();
mockAuthInstances.set('default', primaryAuth);
mockAuthInstances.set('[MockApp]', primaryAuth);

export const auth = primaryAuth;

export function getAuth(app?: any) {
  const name = app?.name || 'default';
  if (!mockAuthInstances.has(name)) {
    mockAuthInstances.set(name, new MockAuth());
  }
  return mockAuthInstances.get(name)!;
}

export function onAuthStateChanged(auth: any, callback: (user: any) => void) {
  authListeners.add(callback);
  setTimeout(() => { callback(auth.currentUser); }, 0);
  return () => { authListeners.delete(callback); };
}

export async function signInWithEmailAndPassword(auth: any, email: string, pass: string) {
  const emailClean = email.toLowerCase().trim();
  const usersStr = localStorage.getItem('hortamanager_auth_users') || '[]';
  const users = JSON.parse(usersStr);
  const found = users.find((u: any) => u.email.toLowerCase().trim() === emailClean);
  
  if (!found || found.password !== pass) {
    const err: any = new Error('Usuário ou senha inválidos.');
    err.code = 'auth/invalid-credential';
    throw err;
  }
  
  const userPayload: User = {
    uid: found.uid,
    email: found.email,
    displayName: found.displayName || found.email.split('@')[0],
    emailVerified: true,
    isAnonymous: false,
    tenantId: null
  };
  auth.setCurrentUser(userPayload);
  return { user: userPayload };
}

export async function createUserWithEmailAndPassword(auth: any, email: string, pass: string) {
  const emailClean = email.toLowerCase().trim();
  const usersStr = localStorage.getItem('hortamanager_auth_users') || '[]';
  const users = JSON.parse(usersStr);
  const exists = users.find((u: any) => u.email.toLowerCase().trim() === emailClean);
  
  if (exists) {
    const err: any = new Error('Email already in use.');
    err.code = 'auth/email-already-in-use';
    throw err;
  }
  
  const newUid = 'uid_' + Math.random().toString(36).substring(2, 11);
  const newUser = { uid: newUid, email: emailClean, displayName: emailClean.split('@')[0], password: pass };
  users.push(newUser);
  localStorage.setItem('hortamanager_auth_users', JSON.stringify(users));
  
  const userPayload: User = {
    uid: newUid,
    email: emailClean,
    displayName: newUser.displayName,
    emailVerified: true,
    isAnonymous: false,
    tenantId: null
  };
  auth.setCurrentUser(userPayload);
  return { user: userPayload };
}

export async function signOut(auth: any) {
  auth.setCurrentUser(null);
}

export async function updateProfile(user: any, info: { displayName?: string }) {
  const usersStr = localStorage.getItem('hortamanager_auth_users') || '[]';
  const users = JSON.parse(usersStr);
  const idx = users.findIndex((u: any) => u.uid === user.uid);
  if (idx >= 0) {
    users[idx].displayName = info.displayName;
    localStorage.setItem('hortamanager_auth_users', JSON.stringify(users));
  }
  
  // Update currently logged-in details on any active auth session
  for (const session of mockAuthInstances.values()) {
    if (session.currentUser && session.currentUser.uid === user.uid) {
      session.setCurrentUser({
        ...session.currentUser,
        displayName: info.displayName || session.currentUser.displayName
      });
    }
  }
}

export async function updatePassword(user: any, newPassword: string) {
  const usersStr = localStorage.getItem('hortamanager_auth_users') || '[]';
  const users = JSON.parse(usersStr);
  const idx = users.findIndex((u: any) => u.uid === user.uid);
  if (idx >= 0) {
    users[idx].password = newPassword;
    localStorage.setItem('hortamanager_auth_users', JSON.stringify(users));
  }
}

// --- Firestore Mock implementation ---
export const db = { type: 'firestore' };
export function getFirestore() { return db; }
export async function enableMultiTabIndexedDbPersistence(db: any) { return; }

function getBootstrapData(collectionPath: string): any[] {
  if (collectionPath === 'categories') {
    return [
      { id: 'cat1', name: 'Aluguel', type: 'transaction' },
      { id: 'cat2', name: 'Água / Energia', type: 'transaction' },
      { id: 'cat3', name: 'Sementes / Mudas', type: 'transaction' },
      { id: 'cat4', name: 'Fertilizantes', type: 'transaction' },
      { id: 'cat5', name: 'Ferramentas', type: 'transaction' },
      { id: 'cat6', name: 'Salários', type: 'transaction' },
      { id: 'cat7', name: 'Combustível', type: 'transaction' },
      { id: 'cat8', name: 'Venda de Produtos', type: 'transaction' },
      
      { id: 'cat9', name: 'Hortaliças', type: 'inventory' },
      { id: 'cat10', name: 'Legumes', type: 'inventory' },
      { id: 'cat11', name: 'Insumos', type: 'inventory' },
      { id: 'cat12', name: 'Fertilizantes', type: 'inventory' },
      { id: 'cat13', name: 'Processados', type: 'inventory' },
    ];
  }
  return [];
}

function getStoredCollection(collectionPath: string): any[] {
  const key = `hortamanager_db_${collectionPath}`;
  const data = localStorage.getItem(key);
  if (!data) {
    const bootstrapped = getBootstrapData(collectionPath);
    if (bootstrapped.length > 0) {
      localStorage.setItem(key, JSON.stringify(serialize(bootstrapped)));
      return bootstrapped;
    }
    return [];
  }
  try {
    return deserialize(JSON.parse(data));
  } catch (e) {
    console.error(`Error reading ${collectionPath}:`, e);
    return [];
  }
}

function saveStoredCollection(collectionPath: string, docs: any[]) {
  const key = `hortamanager_db_${collectionPath}`;
  localStorage.setItem(key, JSON.stringify(serialize(docs)));
  notifyListeners(collectionPath);
}

// Global firestore model observers
type Observer = () => void;
const dbObservers = new Map<string, Set<Observer>>();

function subscribeToCollection(collectionPath: string, callback: Observer) {
  if (!dbObservers.has(collectionPath)) {
    dbObservers.set(collectionPath, new Set());
  }
  dbObservers.get(collectionPath)!.add(callback);
  return () => {
    dbObservers.get(collectionPath)?.delete(callback);
  };
}

function notifyListeners(collectionPath: string) {
  const list = dbObservers.get(collectionPath);
  if (list) {
    list.forEach(cb => { try { cb(); } catch (e) {} });
  }
}

export function collection(db: any, path: string) {
  return { type: 'collection', path };
}

export function doc(dbOrCol: any, pathOrId?: string, id?: string) {
  if (id) {
    return { type: 'document', path: `${pathOrId}/${id}`, id, collectionName: pathOrId };
  } else if (pathOrId) {
    if (dbOrCol.type === 'collection') {
      return { type: 'document', path: `${dbOrCol.path}/${pathOrId}`, id: pathOrId, collectionName: dbOrCol.path };
    } else {
      const parts = pathOrId.split('/');
      return { type: 'document', path: pathOrId, id: parts[1], collectionName: parts[0] };
    }
  } else {
    const colName = dbOrCol.path;
    const generatedId = 'mock_id_' + Math.random().toString(36).substring(2, 11);
    return { type: 'document', path: `${colName}/${generatedId}`, id: generatedId, collectionName: colName };
  }
}

export async function getDoc(docRef: any) {
  const parts = docRef.id ? [docRef.collectionName, docRef.id] : docRef.path.split('/');
  const colName = parts[0];
  const id = parts[1];
  const docs = getStoredCollection(colName);
  const found = docs.find(doc => doc.id === id);
  return {
    id,
    ref: docRef,
    exists: () => !!found,
    data: () => found
  };
}

export async function setDoc(docRef: any, data: any, options?: any) {
  const parts = docRef.path.split('/');
  const colName = parts[0];
  const id = parts[1];
  const docs = getStoredCollection(colName);
  const idx = docs.findIndex(doc => doc.id === id);
  
  const processedData = { ...data };
  for (const k of Object.keys(processedData)) {
    if (processedData[k] && processedData[k]._isServerTimestamp) {
      processedData[k] = Timestamp.now();
    }
  }

  let finalDoc: any;
  if (idx >= 0) {
    if (options && options.merge) {
      finalDoc = { ...docs[idx], ...processedData, id };
    } else {
      finalDoc = { ...processedData, id };
    }
    docs[idx] = finalDoc;
  } else {
    finalDoc = { ...processedData, id };
    docs.push(finalDoc);
  }
  
  saveStoredCollection(colName, docs);
}

export async function addDoc(collectionRef: any, data: any) {
  const colName = collectionRef.path;
  const docs = getStoredCollection(colName);
  const id = 'mock_id_' + Math.random().toString(36).substring(2, 11);
  
  const processedData = { ...data };
  for (const k of Object.keys(processedData)) {
    if (processedData[k] && processedData[k]._isServerTimestamp) {
      processedData[k] = Timestamp.now();
    }
  }

  const newDoc = { ...processedData, id };
  docs.push(newDoc);
  saveStoredCollection(colName, docs);
  return { id, ref: doc(db, colName, id) };
}

export async function updateDoc(docRef: any, data: any) {
  const parts = docRef.path.split('/');
  const colName = parts[0];
  const id = parts[1];
  const docs = getStoredCollection(colName);
  const idx = docs.findIndex(doc => doc.id === id);
  if (idx >= 0) {
    const updated = { ...docs[idx] };
    
    for (const k of Object.keys(data)) {
      let val = data[k];
      if (val === undefined) continue;
      if (val && val._isServerTimestamp) {
        val = Timestamp.now();
      }
      setNestedValue(updated, k, val);
    }
    
    docs[idx] = updated;
    saveStoredCollection(colName, docs);
  } else {
    throw new Error(`Document not found to update: ${docRef.path}`);
  }
}

export async function deleteDoc(docRef: any) {
  const parts = docRef.path.split('/');
  const colName = parts[0];
  const id = parts[1];
  const docs = getStoredCollection(colName);
  const filtered = docs.filter(doc => doc.id !== id);
  saveStoredCollection(colName, filtered);
}

export interface MockQuery {
  collectionPath: string;
  filters: Array<{ field: string, op: string, value: any }>;
  sorts: Array<{ field: string, dir: 'asc' | 'desc' }>;
  limitVal?: number;
}

export function query(ref: any, ...constraints: any[]) {
  const q: MockQuery = {
    collectionPath: ref.path || ref.collectionPath,
    filters: [...(ref.filters || [])],
    sorts: [...(ref.sorts || [])],
    limitVal: ref.limitVal
  };
  for (const c of constraints) {
    if (!c) continue;
    if (c.type === 'where') {
      q.filters.push({ field: c.field, op: c.op, value: c.value });
    } else if (c.type === 'orderBy') {
      q.sorts.push({ field: c.field, dir: c.dir });
    } else if (c.type === 'limit') {
      q.limitVal = c.limit;
    }
  }
  return q;
}

export function where(field: string, op: string, value: any) {
  return { type: 'where', field, op, value };
}

export function orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
  return { type: 'orderBy', field, dir };
}

export function limit(count: number) {
  return { type: 'limit', limit: count };
}

export async function getDocs(q: any) {
  const colName = q.collectionPath || q.path;
  const docs = getStoredCollection(colName);
  
  let filtered = [...docs];
  if (q.filters && q.filters.length > 0) {
    for (const f of q.filters) {
      filtered = filtered.filter(docVal => {
        const val = getNestedValue(docVal, f.field);
        
        if (f.op === '==') {
          return val === f.value;
        } else if (f.op === '>=') {
          if (val instanceof Timestamp && f.value instanceof Timestamp) {
            return val.valueOf() >= f.value.valueOf();
          }
          if (val instanceof Timestamp && f.value instanceof Date) {
            return val.valueOf() >= f.value.getTime();
          }
          if (val instanceof Date && f.value instanceof Date) {
            return val.getTime() >= f.value.getTime();
          }
          return val >= f.value;
        } else if (f.op === '<=') {
          if (val instanceof Timestamp && f.value instanceof Timestamp) {
            return val.valueOf() <= f.value.valueOf();
          }
          if (val instanceof Timestamp && f.value instanceof Date) {
            return val.valueOf() <= f.value.getTime();
          }
          if (val instanceof Date && f.value instanceof Date) {
            return val.getTime() <= f.value.getTime();
          }
          return val <= f.value;
        } else if (f.op === 'in') {
          return Array.isArray(f.value) && f.value.includes(val);
        }
        return true;
      });
    }
  }
  
  if (q.sorts && q.sorts.length > 0) {
    for (const s of q.sorts) {
      filtered.sort((a, b) => {
        let valA = getNestedValue(a, s.field);
        let valB = getNestedValue(b, s.field);
        
        if (valA instanceof Timestamp) valA = valA.valueOf();
        if (valB instanceof Timestamp) valB = valB.valueOf();
        if (valA instanceof Date) valA = valA.getTime();
        if (valB instanceof Date) valB = valB.getTime();
        
        if (valA === undefined || valA === null) return 1;
        if (valB === undefined || valB === null) return -1;
        
        if (valA < valB) return s.dir === 'asc' ? -1 : 1;
        if (valA > valB) return s.dir === 'asc' ? 1 : -1;
        return 0;
      });
    }
  }
  
  if (q.limitVal !== undefined) {
    filtered = filtered.slice(0, q.limitVal);
  }
  
  return {
    docs: filtered.map(item => ({
      id: item.id,
      ref: doc(db, colName, item.id),
      exists: () => true,
      data: () => item
    })),
    size: filtered.length,
    empty: filtered.length === 0,
    forEach(callback: any) {
      filtered.forEach(item => {
        callback({
          id: item.id,
          ref: doc(db, colName, item.id),
          exists: () => true,
          data: () => item
        });
      });
    }
  };
}

export function onSnapshot(ref: any, onNext: any, onError?: any) {
  const collectionPath = ref.collectionPath || ref.path;
  
  const execute = async () => {
    try {
      if (ref.type === 'document' || ref.id) {
        const d = await getDoc(ref);
        onNext(d);
      } else {
        const snapshot = await getDocs(ref);
        onNext(snapshot);
      }
    } catch (err) {
      if (onError) onError(err);
      else console.error(err);
    }
  };
  
  execute();
  return subscribeToCollection(collectionPath, execute);
}

// --- Special field values ---
export function serverTimestamp() { return { _isServerTimestamp: true }; }
export function increment(n: number) { return { _isIncrement: true, value: n }; }
export function deleteField() { return { _isDeleteField: true }; }

export function writeBatch(db: any) {
  const ops: Array<() => Promise<void>> = [];
  return {
    set(docRef: any, data: any, options?: any) { ops.push(() => setDoc(docRef, data, options)); },
    update(docRef: any, data: any) { ops.push(() => updateDoc(docRef, data)); },
    delete(docRef: any) { ops.push(() => deleteDoc(docRef)); },
    async commit() {
      for (const op of ops) {
        await op();
      }
    }
  };
}
