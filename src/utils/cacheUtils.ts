/**
 * cacheUtils.ts
 * LRU (Least Recently Used) Cache für optimierte Speicherung mit automatischer Verdrängung
 */

/**
 * LRU-Cache-Implementierung mit TypeScript-Generics
 * Automatische Verdrängung der am längsten nicht verwendeten Elemente
 */
export class LRUCache<K, V> {
    private capacity: number;
    private cache: Map<K, V>;
    private recentKeys: K[];
  
    /**
     * Erstellt einen neuen LRU-Cache mit der angegebenen Kapazität
     * @param capacity Maximale Anzahl von Elementen im Cache
     */
    constructor(capacity: number) {
      this.capacity = Math.max(1, capacity); // Mindestens 1
      this.cache = new Map<K, V>();
      this.recentKeys = [];
    }
  
    /**
     * Ruft einen Wert aus dem Cache ab
     * @param key Der Schlüssel des abzurufenden Elements
     * @returns Der Wert oder undefined, wenn nicht gefunden
     */
    get(key: K): V | undefined {
      // Wenn der Schlüssel nicht im Cache ist
      if (!this.cache.has(key)) {
        return undefined;
      }
  
      // Aktualisiere die Position des Schlüssels (markiere als kürzlich verwendet)
      this.updateKeyRecency(key);
  
      // Gib den Wert zurück
      return this.cache.get(key);
    }
  
    /**
     * Speichert einen Wert im Cache
     * @param key Der Schlüssel des zu speichernden Elements
     * @param value Der zu speichernde Wert
     */
    set(key: K, value: V): void {
      // Falls der Schlüssel bereits existiert, aktualisiere den Wert und die Reihenfolge
      if (this.cache.has(key)) {
        this.cache.set(key, value);
        this.updateKeyRecency(key);
        return;
      }
  
      // Überprüfe, ob der Cache voll ist
      if (this.cache.size >= this.capacity) {
        // Entferne das am längsten nicht verwendete Element
        const oldestKey = this.recentKeys.shift();
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
  
      // Füge das neue Element hinzu
      this.cache.set(key, value);
      this.recentKeys.push(key);
    }
  
    /**
     * Prüft, ob ein Schlüssel im Cache existiert
     * @param key Der zu prüfende Schlüssel
     * @returns true, wenn der Schlüssel existiert, sonst false
     */
    has(key: K): boolean {
      return this.cache.has(key);
    }
  
    /**
     * Entfernt ein Element aus dem Cache
     * @param key Der Schlüssel des zu entfernenden Elements
     * @returns true, wenn das Element existierte und entfernt wurde, sonst false
     */
    delete(key: K): boolean {
      if (!this.cache.has(key)) {
        return false;
      }
  
      // Entferne den Schlüssel aus der Map
      this.cache.delete(key);
  
      // Entferne den Schlüssel aus der Reihenfolge
      const index = this.recentKeys.indexOf(key);
      if (index !== -1) {
        this.recentKeys.splice(index, 1);
      }
  
      return true;
    }
  
    /**
     * Leert den gesamten Cache
     */
    clear(): void {
      this.cache.clear();
      this.recentKeys = [];
    }
  
    /**
     * Gibt die aktuelle Anzahl der Elemente im Cache zurück
     */
    get size(): number {
      return this.cache.size;
    }
  
    /**
     * Gibt die maximale Kapazität des Caches zurück
     */
    get maxSize(): number {
      return this.capacity;
    }
  
    /**
     * Setzt die maximale Kapazität des Caches neu
     * Wenn die neue Kapazität kleiner ist als die aktuelle Größe,
     * werden die ältesten Elemente entfernt
     * @param newCapacity Die neue maximale Kapazität
     */
    setCapacity(newCapacity: number): void {
      // Mindestens 1
      this.capacity = Math.max(1, newCapacity);
  
      // Entferne überschüssige Elemente, falls nötig
      while (this.cache.size > this.capacity) {
        const oldestKey = this.recentKeys.shift();
        if (oldestKey !== undefined) {
          this.cache.delete(oldestKey);
        }
      }
    }
  
    /**
     * Aktualisiert die Position eines Schlüssels in der Verwendungsreihenfolge
     * (Markiert ihn als kürzlich verwendet)
     * @param key Der zu aktualisierende Schlüssel
     */
    private updateKeyRecency(key: K): void {
      // Entferne den Schlüssel aus seiner aktuellen Position
      const index = this.recentKeys.indexOf(key);
      if (index !== -1) {
        this.recentKeys.splice(index, 1);
      }
  
      // Füge den Schlüssel am Ende hinzu (als am kürzlich verwendeten)
      this.recentKeys.push(key);
    }
  
    /**
     * Gibt alle Schlüssel im Cache zurück
     * @returns Ein Array mit allen Schlüsseln
     */
    keys(): K[] {
      return [...this.cache.keys()];
    }
  
    /**
     * Gibt alle Werte im Cache zurück
     * @returns Ein Array mit allen Werten
     */
    values(): V[] {
      return [...this.cache.values()];
    }
  
    /**
     * Gibt alle Schlüssel-Wert-Paare im Cache zurück
     * @returns Ein Array mit Schlüssel-Wert-Paaren
     */
    entries(): [K, V][] {
      return [...this.cache.entries()];
    }
  }