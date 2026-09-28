import { SignedInOnly } from "@/components/auth/SignedInOnly";

export default function TimetableLayout({ children }: { children: React.ReactNode }) {
  return <SignedInOnly>{children}</SignedInOnly>;
}
