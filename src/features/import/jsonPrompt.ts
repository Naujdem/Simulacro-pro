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
              "seccion": "Gramática",
              "enunciado": "She ___ lived here since 2010.",
              "opciones": ["have", "has", "had", "is"],
              "correcta": 1,
              "explicacion": "Con she/he/it se usa has."
            },
            {
              "tipo": "true_false",
              "seccion": "Gramática",
              "enunciado": "\\"I have went to Paris\\" es correcto.",
              "correcta": false,
              "explicacion": "Lo correcto es \\"I have gone\\"."
            },
            {
              "tipo": "fill_blank",
              "seccion": "Gramática",
              "enunciado": "I have ___ my homework already.",
              "correcta": "done",
              "explicacion": "Participio de do."
            },
            {
              "tipo": "order_words",
              "seccion": "Gramática",
              "palabras": ["lived", "has", "here", "She", "since", "2010"],
              "correcta": "She has lived here since 2010",
              "explicacion": "Sujeto + has + participio + complemento."
            },
            {
              "tipo": "transform",
              "seccion": "Gramática",
              "original": "She has finished the report.",
              "forma": "negativa",
              "correcta": "She has not finished the report.",
              "explicacion": "has + not + participio."
            }
          ],
          "lecturas": [
            {
              "titulo": "A Trip to London",
              "seccion": "Lectura 1: A Trip to London",
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
  "lecturas": [ { "titulo": "…", "seccion": "Lectura 1: …", "texto": "…", "preguntas": [ PREGUNTA ] } ] }

PREGUNTA, según "tipo" (en todas, "explicacion" es opcional pero muy recomendable, y "seccion" es opcional, ver SECCIONES):
- multiple_choice: { "tipo": "multiple_choice", "seccion": "…", "enunciado": "…", "opciones": ["…","…","…","…"], "correcta": 1, "explicacion": "…" }
  → "correcta" es el NÚMERO de la opción correcta EMPEZANDO EN 0 (la primera opción es 0). Si hay varias correctas, una lista: [0, 2].
- true_false: { "tipo": "true_false", "seccion": "…", "enunciado": "…", "correcta": true, "explicacion": "…" }   (true/false sin comillas)
- fill_blank: { "tipo": "fill_blank", "seccion": "…", "enunciado": "I have ___ my homework.", "correcta": "done", "explicacion": "…" }
  → un "___" por cada espacio. Con varios espacios, "correcta" es una lista con una respuesta por espacio; si un espacio admite varias formas, una sublista: [["done","did"], "saw"].
- order_words: { "tipo": "order_words", "seccion": "…", "palabras": ["lived","has","She","here"], "correcta": "She has lived here", "explicacion": "…" }
  → "palabras" desordenadas; deben ser exactamente las palabras de "correcta".
- transform: { "tipo": "transform", "seccion": "…", "original": "She has finished.", "forma": "negativa", "correcta": "She has not finished.", "explicacion": "…" }
  → "forma" es afirmativa, negativa o interrogativa. "correcta" puede ser una lista si hay varias respuestas válidas.

SECCIONES: "seccion" es el nombre de la parte del simulacro a la que pertenece la pregunta (por ejemplo "Gramática" o "Lectura 1: A Trip to London"). La app agrupa las preguntas por sección, en el orden en que aparecen, y hace una pausa con el resultado parcial entre sección y sección. Usa EXACTAMENTE el mismo texto en todas las preguntas de una misma sección. Las preguntas dentro de una lectura toman la "seccion" de la lectura si no traen una propia. Si no pones "seccion", la pregunta queda en "General".

REGLAS: JSON válido (comillas dobles, sin comas finales, sin comentarios). Nada de texto fuera del JSON. Mantén el idioma original del material. Cada simulacro debe tener al menos una pregunta o una lectura (con sus preguntas de comprensión).

INSTRUCCIONES ESPECÍFICAS PARA ESTE LIBRO DE INGLÉS:

El material es de un "Cuadernillo de Inglés Básico" con 8 bloques. Cada bloque tiene teoría y varios tipos de ejercicios. Convierte así:

1. EJERCICIOS DE COMPLETAR CON am/is/are, much/many, etc.:
   → Tipo "multiple_choice" con las opciones entre las que hay que elegir.

2. EJERCICIOS DE COMPLETAR ESPACIOS (con verbos, auxiliares, etc.):
   → Tipo "fill_blank". El espacio va como ___ en el enunciado.

3. EJERCICIOS DE VERDADERO/FALSO:
   → Tipo "true_false".

4. EJERCICIOS DE ORDENAR PALABRAS:
   → Tipo "order_words".

5. EJERCICIOS DE TRANSFORMACIÓN DE ORACIONES:
   → Tipo "transform".

6. LECTURAS (Reading):
   → Van dentro de "lecturas" del simulacro.

7. VOCABULARIO NUEVO:
   → Tipo "fichas" al final del JSON.

ESTRUCTURA DE BIBLIOTECAS:
Crea las bibliotecas "Inglés - Gramática", "Inglés - Reading" e "Inglés - Vocabulario".
(Las fichas no van dentro de una biblioteca: agrúpalas con "mazo": "Inglés::Vocabulario".)

ESTRUCTURA DE SECCIONES:
Cuando un simulacro tenga más de 20 preguntas, divídelo en SECCIONES con el campo "seccion":
- "Gramática" para las preguntas gramaticales.
- "Lectura 1: [nombre]" para las preguntas de cada lectura.
Ejemplo:
{
  "tipo": "multiple_choice",
  "seccion": "Gramática",
  "enunciado": "I ___ a happy boy.",
  ...
}

MATERIAL:
[pega aquí lo que quieres convertir]`;
