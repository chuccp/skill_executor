declare module 'sql.js' {
  export interface Database {
    run(sql: string, params?: any[]): void;
    exec(sql: string): void;
    prepare(sql: string): Statement;
    getRowsModified(): number;
    getLastInsertRowId(): number;
    export(): Uint8Array;
    close(): void;
  }

  export interface Statement {
    bind(params?: any[]): void;
    step(): boolean;
    getAsObject(): any;
    free(): void;
  }

  export interface SqlJsStatic {
    Database: {
      new(data?: ArrayLike<number> | Buffer | null): Database;
    };
  }

  export default function initSqlJs(config?: any): Promise<SqlJsStatic>;
}
