export interface ParsedCard {
  front: string;
  back: string;
}

export interface CsvImportResult {
  cards: ParsedCard[];
  skipped: number;
}

/** Convierte el texto de un CSV en filas de columnas. Soporta comillas, comas y saltos de línea dentro de comillas. */
function parseRows(input: string): { rows: string[][]; delimiter: string } {
  const text = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input; // quita el BOM de Excel

  // Detecta el separador mirando la primera línea: coma, punto y coma (Excel en español) o tabulador
  const firstLine = text.split(/\r?\n/)[0] ?? '';
  const count = (ch: string) => firstLine.split(ch).length - 1;
  const delimiter = [',', ';', '\t'].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  row.push(field);
  rows.push(row);

  return { rows, delimiter };
}

/** Lee un CSV con formato frente,reverso y devuelve las fichas válidas. */
export function parseFlashcardsCsv(text: string): CsvImportResult {
  const { rows, delimiter } = parseRows(text);
  const cards: ParsedCard[] = [];
  let skipped = 0;

  rows.forEach((cols, i) => {
    const front = (cols[0] ?? '').trim();
    // Si el reverso trae separadores sin comillas, se vuelve a unir en vez de perder texto
    const back = cols.slice(1).join(delimiter).trim();

    if (front === '' && back === '') return; // fila vacía: se ignora sin contarla

    // Encabezado opcional: "frente,reverso"
    if (i === 0) {
      const f = front.toLowerCase();
      const b = back.toLowerCase();
      if ((f === 'frente' && b === 'reverso') || (f === 'front' && b === 'back')) return;
    }

    if (front === '' || back === '') {
      skipped++;
      return;
    }
    cards.push({ front, back });
  });

  return { cards, skipped };
}
