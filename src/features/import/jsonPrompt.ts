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

/** Texto para pegarle a ChatGPT / Claude: explica el formato, da ejemplos correctos e incorrectos y las reglas del Cuadernillo. */
export const JSON_PROMPT = `Quiero que conviertas el material que te voy a dar en un JSON para importarlo en mi app de estudio. Responde SOLO con el JSON, dentro de un bloque de código, sin explicaciones.

FORMATO (las claves van exactamente así, en español y sin tildes):

{
  "version": 1,
  "bibliotecas": [ { "nombre": "…", "color": "#0ea5e9", "descripcion": "…", "simulacros": [ SIMULACRO ] } ],
  "simulacros": [ SIMULACRO ],
  "fichas": [ { "frente": "…", "reverso": "…", "mazo": "Grupo::Mazo" } ]
}

SIMULACRO = { "titulo": "…", "tema": "…", "descripcion": "…", "orden": 1,
  "preguntas": [ PREGUNTA ],
  "lecturas": [ { "titulo": "…", "seccion": "…", "texto": "…", "preguntas": [ PREGUNTA ] } ] }

PREGUNTA, según "tipo" (en todas, "seccion" es obligatorio y "explicacion" es opcional pero muy recomendable):

- multiple_choice:
  { "tipo": "multiple_choice", "seccion": "Gramática", "enunciado": "…", "opciones": ["…","…","…","…"], "correcta": 1, "explicacion": "…" }
  → "correcta" es el NÚMERO de la opción correcta EMPEZANDO EN 0 (la primera opción es 0).

- true_false:
  { "tipo": "true_false", "seccion": "Gramática", "enunciado": "…", "correcta": true, "explicacion": "…" }
  → "correcta" es true o false (sin comillas).

- fill_blank:
  { "tipo": "fill_blank", "seccion": "Gramática", "enunciado": "I have ___ my homework.", "correcta": "done", "explicacion": "…" }
  → El enunciado SIEMPRE debe tener ___ (tres guiones bajos) donde va la respuesta.
  → Si hay varios espacios, "correcta" es una lista con una respuesta por espacio: ["done", "saw"].
  → Si un espacio admite varias formas, usa una sublista: [["done","did"], "saw"].
  → Si es una respuesta corta (ej. "Was he happy? ___"), el ___ va al final.

- order_words:
  { "tipo": "order_words", "seccion": "Gramática", "palabras": ["lived","has","She","here"], "correcta": "She has lived here", "explicacion": "…" }
  → "palabras" debe ser una lista de PALABRAS INDIVIDUALES (no frases compuestas).
  → Cada elemento de "palabras" debe ser UNA SOLA PALABRA.
  → ERROR COMÚN: no pongas "in the evening" como un solo elemento. Sepáralo en "in", "the", "evening".
  → ERROR COMÚN: no pongas "next weekend" como un solo elemento. Sepáralo en "next", "weekend".
  → El número de palabras en "palabras" debe coincidir EXACTAMENTE con el número de palabras en "correcta".

- transform:
  { "tipo": "transform", "seccion": "Gramática", "original": "She has finished.", "forma": "negativa", "correcta": "She has not finished.", "explicacion": "…" }
  → "forma" es "afirmativa", "negativa" o "interrogativa".
  → "correcta" puede ser un texto o una lista de textos aceptados: ["She has not finished.", "She hasn't finished."].

REGLAS:
- JSON válido (comillas dobles, sin comas finales, sin comentarios).
- Nada de texto fuera del JSON.
- Mantén el idioma original del material.
- Cada simulacro debe tener al menos una pregunta o una lectura.
- Cada lectura debe tener "seccion" (ej. "Lectura 1: Mary and her family").
- Cada pregunta debe tener "seccion" (ej. "Gramática" o "Lectura 1: ...").
- Usa comillas dobles siempre.
- NO uses paréntesis ( ) en lugar de corchetes [ ].
- NO escapes los corchetes con \\.
- NO escapes los guiones bajos _.

---

EJEMPLOS CORRECTOS E INCORRECTOS:

✅ CORRECTO (multiple_choice):
{
  "tipo": "multiple_choice",
  "seccion": "Gramática",
  "enunciado": "I ___ a happy boy.",
  "opciones": ["am", "is", "are", "be"],
  "correcta": 0,
  "explicacion": "El pronombre I siempre se utiliza con am."
}

❌ INCORRECTO:
{
  "tipo": "seleccion_multiple",
  "pregunta": "I ___ a happy boy.",
  "opciones": ("am", "is", "are", "be"),
  "respuesta": "am"
}
(No uses "seleccion_multiple", ni "pregunta", ni paréntesis, ni "respuesta".)

✅ CORRECTO (true_false):
{
  "tipo": "true_false",
  "seccion": "Gramática",
  "enunciado": "She is a teacher.",
  "correcta": true,
  "explicacion": "She utiliza is."
}

❌ INCORRECTO:
{
  "tipo": "verdadero_falso",
  "pregunta": "She is a teacher.",
  "respuesta": "Verdadero"
}
(No uses "verdadero_falso", ni "respuesta" como texto.)

✅ CORRECTO (fill_blank):
{
  "tipo": "fill_blank",
  "seccion": "Gramática",
  "enunciado": "She ___ TV every day.",
  "correcta": "watches",
  "explicacion": "Tercera persona del singular: se agrega -es."
}

❌ INCORRECTO:
{
  "tipo": "completar",
  "pregunta": "She watches TV every day.",
  "respuesta": "watches"
}
(No uses "completar", ni olvides los ___.)

✅ CORRECTO (order_words):
{
  "tipo": "order_words",
  "seccion": "Gramática",
  "palabras": ["lived", "has", "She", "here", "since", "2010"],
  "correcta": "She has lived here since 2010",
  "explicacion": "Sujeto + has + participio + complemento."
}

❌ INCORRECTO:
{
  "tipo": "ordenar_palabras",
  "palabras": ["lived", "has", "She", "here since 2010"],
  "correcta": "She has lived here since 2010"
}
(No uses "ordenar_palabras", ni frases compuestas en "palabras".)

✅ CORRECTO (transform):
{
  "tipo": "transform",
  "seccion": "Gramática",
  "original": "She has finished the report.",
  "forma": "negativa",
  "correcta": ["She has not finished the report.", "She hasn't finished the report."],
  "explicacion": "has + not + participio."
}

❌ INCORRECTO:
{
  "tipo": "traduccion",
  "original": "She has finished the report.",
  "forma": "negativa",
  "respuesta": "She has not finished the report."
}
(No uses "traduccion" ni "respuesta".)

---

INSTRUCCIONES ESPECÍFICAS PARA EL LIBRO DE INGLÉS:

El material es de un "Cuadernillo de Inglés Básico" con 8 bloques. Convierte así:

1. EJERCICIOS DE COMPLETAR CON am/is/are, much/many, etc.:
   → Tipo "multiple_choice" con las opciones entre las que hay que elegir.

2. EJERCICIOS DE COMPLETAR ESPACIOS (con verbos, auxiliares, etc.):
   → Tipo "fill_blank". El espacio va como ___ en el enunciado.

3. EJERCICIOS DE VERDADERO/FALSO:
   → Tipo "true_false".

4. EJERCICIOS DE ORDENAR PALABRAS:
   → Tipo "order_words". Cada palabra individual en "palabras".

5. EJERCICIOS DE TRANSFORMACIÓN DE ORACIONES:
   → Tipo "transform".

6. LECTURAS (Reading):
   → Van dentro de "lecturas" del simulacro, con su "seccion" (ej. "Lectura 1: Mary and her family").

7. VOCABULARIO NUEVO:
   → Tipo "fichas" al final del JSON, con "mazo" (ej. "Inglés::Vocabulario").

ESTRUCTURA DE BIBLIOTECAS:

Crea UNA biblioteca llamada "Inglés - Gramática" con los 8 bloques como simulacros:
- Simulacro 1: "Bloque I - Personal profile" (orden 1)
- Simulacro 2: "Bloque II - Daily Routines" (orden 2)
- Simulacro 3: "Bloque III - Here and now" (orden 3)
- Simulacro 4: "Bloque IV - Units and Measurement" (orden 4)
- Simulacro 5: "Bloque V - Similarities and Differences" (orden 5)
- Simulacro 6: "Bloque VI - Old Times" (orden 6)
- Simulacro 7: "Bloque VII - Rules and Obligations" (orden 7)
- Simulacro 8: "Bloque VIII - Plans and predictions" (orden 8)

Crea OTRA biblioteca llamada "Inglés - Reading" con los textos del libro.
Las fichas de vocabulario NO van dentro de una biblioteca: van en la lista "fichas" de la raíz del JSON, con "mazo": "Inglés::Vocabulario". No crees una biblioteca vacía para ellas.

SI EL MATERIAL ES DE UN SOLO BLOQUE:
Crea solo ese simulacro dentro de la biblioteca correspondiente.

---

MATERIAL:
[Pega aquí el texto del bloque]`;
