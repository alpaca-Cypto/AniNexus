import { OwnerOnly } from "@/components/auth/OwnerOnly";

export default function PersonalAiLayout({ children }: { children: React.ReactNode }) {
  return <OwnerOnly>{children}</OwnerOnly>;
}
