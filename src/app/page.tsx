import { redirect } from "next/navigation";
import { getDb } from "@/src/shared/lib/db/instance";
import { hasAnyAdmin } from "@/src/shared/lib/db/users";
import { getSession } from "@/src/shared/lib/auth/session";
import { Shell } from "@/src/widgets/shell";
import { ChatPanel } from "@/src/features/chat-panel";

const demoMessages = [
  { id: 1, sender: "Мастер", role: "master" as const, text: "Вы входите в таверну «Сломанная стрела». Внутри полумрак, пахнет элем и жареным мясом." },
  { id: 2, sender: "Гаррет", role: "player" as const, text: "Осматриваюсь. Есть кто подозрительный?" },
  { id: 3, sender: "Мастер", role: "master" as const, text: "За дальним столом трое гоблинов что-то бурно обсуждают. Бармен протирает кружки, искоса поглядывая на вас." },
  { id: 4, sender: "Мастер", role: "master" as const, text: "Гоблины не обращают на вас внимания. Бармен предлагает выпить." },
];

export default async function Home() {
  await getDb();

  if (!(await hasAnyAdmin())) {
    redirect("/setup");
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <Shell user={session}>
      <ChatPanel messages={demoMessages} />
    </Shell>
  );
}
