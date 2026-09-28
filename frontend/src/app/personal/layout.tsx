import { SignedInOnly } from "@/components/auth/SignedInOnly";

export default function PersonalLayout({ children }: { children: React.ReactNode }) {
  return <SignedInOnly>{children}</SignedInOnly>;
}
