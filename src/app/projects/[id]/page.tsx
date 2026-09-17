import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import ProjectView from "@/components/ProjectView";

export const metadata: Metadata = { title: "작업" };
export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  const { id } = await params;
  if (!user) redirect(`/login?next=/projects/${id}`);

  const project = await prisma.project.findFirst({
    where: { id, userId: user.id },
    include: { outputs: { orderBy: { index: "asc" } } },
  });
  if (!project) notFound();

  // 자막 원본은 크고 화면에서 쓰지 않는다. 대본만 넘긴다.
  const { transcriptJson, scriptJson, ...rest } = project;

  return (
    <ProjectView
      initial={JSON.parse(JSON.stringify(rest))}
      initialScript={scriptJson ? JSON.parse(scriptJson) : null}
    />
  );
}
