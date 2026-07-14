/// <reference types="vite/client" />
import type { IbeApi } from "../../shared/ipc";

declare global {
  interface Window {
    ibe: IbeApi;
  }
}
