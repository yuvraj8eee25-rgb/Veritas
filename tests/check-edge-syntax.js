import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (entry.isFile() && file.endsWith(".ts")) {
      const source = fs.readFileSync(file, "utf8");
      const { diagnostics = [] } = ts.transpileModule(source, {
        fileName: file,
        reportDiagnostics: true,
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
      });
      if (diagnostics.length) {
        for (const diagnostic of diagnostics) {
          const position = diagnostic.file?.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
          const location = position ? `:${position.line + 1}:${position.character + 1}` : "";
          process.stderr.write(`${file}${location}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n")}\n`);
        }
        process.exitCode = 1;
      }
    }
  }
}

visit(path.resolve("supabase/functions"));
