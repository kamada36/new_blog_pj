import { PageEditorForm } from "../PageEditorForm";

export default function NewStaticPage() {
  return (
    <div>
      <h1 className="font-display text-xl font-black">新しい固定ページ</h1>
      <div className="mt-6">
        <PageEditorForm />
      </div>
    </div>
  );
}
