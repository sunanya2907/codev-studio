"use client";
import { useEffect } from "react";
import { reportClientError } from "@/lib/debug-client";

/** Mounted once in the root layout. Renders nothing. */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (ev: ErrorEvent) => reportClientError(ev.error ?? ev.message);
    const onRejection = (ev: PromiseRejectionEvent) => reportClientError(ev.reason);
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);
  return null;
}
