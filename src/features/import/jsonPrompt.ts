/** Ejemplo que carga el botón "Ver ejemplo" (uno de cada tipo). */
export const JSON_EXAMPLE = `{
  "version": 1,
  "bibliotecas": [
    {
      "nombre": "Inglés B1",
      "color": "#0ea5e9",
      "descripcion": "Gramática y lectura nivel B1",
      "simulacros": [
        {
          "titulo": "Present Perfect",
          "tema": "Gramática",
          "descripcion": "Have/has + participio",
          "orden": 1,
          "preguntas": [
            {
              "tipo": "multiple_choice",
              "enunciado": "She ___ lived here since 2010.",
              "opciones": ["have", "has", "had", "is"],
              "correcta": 1,
              "explicacion": "Con she/he/it se usa has."
            },
            {
              "tipo": "true_false",
              "enunciado": "\\"I have went to Paris\\" es correcto.",
              "correcta": false,
              "explicacion": "Lo correcto es \\"I have gone\\"."
            },
            {
              "tipo": "fill_blank",
              "enunciado": "I have ___ my homework already.",
              "correcta": "done",
              "explicacion": "Participio de do."
            },
            {
              "tipo": "order_words",
              "palabras": ["lived", "has", "here", "She", "since", "2010"],
              "correcta": "She has lived here since 2010",
              "explicacion": "Sujeto + has + participio + complemento."
            },
            {
              "tipo": "transform",
              "original": "She has finished the report.",
              "forma": "negativa",
              "correcta": "She has not finished the report.",
              "explicacion": "has + not + participio."
            }
          ],
          "lecturas": [
            {
              "titulo": "A Trip to London",
              "texto": "Last summer Tom visited London. He has always wanted to see Big Ben.",
              "preguntas": [
                { "tipo": "multiple_choice", "enunciado": "Where did Tom go?", "opciones": ["Paris", "London", "Rome"], "correcta": 1 },
                { "tipo": "true_false", "enunciado": "Tom had never wanted to see Big Ben.", "correcta": false }
              ]
            }
          ]
        }
      ]
    }
  ],
  "fichas": [
    { "frente": "have/has + participio", "reverso": "Present Perfect", "mazo": "Inglés::Gramática" }
  ]
}`;

/** Texto para pegarle a ChatGPT / Claude: explica el formato y pide solo el JSON. */
export const JSON_PROMPT = `Quiero que conviertas el material que te voy a dar en un JSON para importarlo en mi app de estudio. Responde SOLO con el JSON, dentro de un bloque de código, sin explicaciones.

FORMATO (las claves van exactamente así, en español y sin tildes):
{
  "version": 1,
  "bibliotecas": [ { "nombre": "…", "color": "#0ea5e9", "descripcion": "…", "simulacros": [ SIMULACRO ] } ],
  "simulacros": [ SIMULACRO ],        // simulacros sin biblioteca (opcional)
  "fichas": [ { "frente": "…", "reverso": "…", "mazo": "Grupo::Mazo" } ]   // opcional
}

SIMULACRO = { "titulo": "…", "tema": "…", "descripcion": "…", "orden": 1,
  "preguntas": [ PREGUNTA ],
  "lecturas": [ { "titulo": "…", "texto": "…", "preguntas": [ PREGUNTA ] } ] }

PREGUNTA, según "tipo" (en todas, "explicacion" es opcional pero muy recomendable):
- multiple_choice: { "tipo": "multiple_choice", "enunciado": "…", "opciones": ["…","…","…","…"], "correcta": 1, "explicacion": "…" }
  → "correcta" es el NÚMERO de la opción correcta EMPEZANDO EN 0 (la primera opción es 0). Si hay varias correctas, una lista: [0, 2].
- true_false: { "tipo": "true_false", "enunciado": "…", "correcta": true, "explicacion": "…" }   (true/false sin comillas)
- fill_blank: { "tipo": "fill_blank", "enunciado": "I have ___ my homework.", "correcta": "done", "explicacion": "…" }
  → un "___" por cada espacio. Con varios espacios, "correcta" es una lista con una respuesta por espacio; si un espacio admite varias formas, una sublista: [["done","did"], "saw"].
- order_words: { "tipo": "order_words", "palabras": ["lived","has","She","here"], "correcta": "She has lived here", "explicacion": "…" }
  → "palabras" desordenadas; deben ser exactamente las palabras de "correcta".
- transform: { "tipo": "transform", "original": "She has finished.", "forma": "negativa", "correcta": "She has not finished.", "explicacion": "…" }
  → "forma" es afirmativa, negativa o interrogativa. "correcta" puede ser una lista si hay varias respuestas válidas.

REGLAS: JSON válido (comillas dobles, sin comas finales, sin comentarios). Nada de texto fuera del JSON. Mantén el idioma original del material. Cada simulacro debe tener al menos una pregunta o una lectura (con sus preguntas de comprensión).

MATERIAL:
[pega aquí lo que quieres convertir]`;
