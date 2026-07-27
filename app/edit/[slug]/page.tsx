import Editor from "../../../components/Editor";

export default async function EditBoard({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <Editor slug={slug.toUpperCase()} />;
}
