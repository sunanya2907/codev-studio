import { Suspense } from "react";
import TesterClient from "./TesterClient";

export const metadata = { title: "Tester access", robots: { index: false, follow: false } };

export default function TesterPage() {
  return (
    <Suspense fallback={null}>
      <TesterClient />
    </Suspense>
  );
}
