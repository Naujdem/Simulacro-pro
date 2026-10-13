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

/** Ejemplo del prompt de simulacros de selección múltiple (se incluye dentro de la guía y se valida en los tests). */
export const JSON_EXAMPLE_SIMULACRO = `{
  "version": 1,
  "bibliotecas": [
    {
      "nombre": "Concurso docente - Ciencias Naturales",
      "descripcion": "Simulacros de selección múltiple",
      "simulacros": [
        {
          "titulo": "Biología y Ley 1620 (1-6)",
          "tema": "Ciencias Naturales",
          "orden": 1,
          "preguntas": [
            {
              "tipo": "multiple_choice",
              "seccion": "Biología",
              "enunciado": "Un docente explica que la fotosíntesis es vital para los ecosistemas. ¿Qué función cumple el sol en este proceso?",
              "opciones": [
                "Fuente de la energía que se convierte en energía química almacenada en los azúcares.",
                "Fuente del agua que las plantas necesitan para crecer.",
                "Fuente del CO₂ que las plantas usan para construir sus tejidos.",
                "Fuente de calor que hace más eficiente la fotosíntesis."
              ],
              "correcta": 0,
              "explicacion": "La fotosíntesis convierte la energía lumínica del sol en energía química; el agua viene del suelo y el CO₂ del aire."
            },
            {
              "tipo": "multiple_choice",
              "seccion": "Ley 1620",
              "enunciado": "Las siguientes acciones son situaciones que pueden constituir delitos. Entre otras se mencionan:\\n1. Agredir físicamente causando lesiones.\\n2. Vender sustancias psicoactivas.\\n3. Portar armas.\\nEstas acciones corresponden a situaciones:",
              "opciones": ["tipo I", "tipo I y II", "tipo II", "tipo III"],
              "correcta": 3,
              "explicacion": "Todas son situaciones tipo III, porque son presuntos delitos contra la Ley Penal Colombiana."
            },
            {
              "tipo": "multiple_choice",
              "seccion": "Biología",
              "enunciado": "[IMAGEN] Observe la gráfica del crecimiento de la población de conejos. ¿Qué ocurre entre los días 5 y 10?",
              "opciones": ["Crece de forma exponencial.", "Se estabiliza en 3,5 individuos por m².", "Disminuye hasta desaparecer."],
              "correcta": 1
            },
            {
              "tipo": "true_false",
              "seccion": "Biología",
              "enunciado": "El docente afirma: “las plantas absorben dióxido de carbono”. ¿Es una afirmación correcta?",
              "correcta": true,
              "explicacion": "Lo usan en la fotosíntesis."
            }
          ],
          "lecturas": [
            {
              "titulo": "Caso del Colegio La Cima",
              "seccion": "Ley 1620",
              "texto": "En el Colegio La Cima, un estudiante es hostigado todos los días por un grupo de compañeros: lo insultan, lo empujan y le esconden sus útiles.",
              "preguntas": [
                {
                  "tipo": "multiple_choice",
                  "enunciado": "Según la Ley 1620, el colegio debe:",
                  "opciones": [
                    "Registrar el caso como acoso escolar y activar la ruta de atención.",
                    "Considerarlo una indisciplina normal y resolverlo en el aula.",
                    "Notificar únicamente al Consejo Académico.",
                    "Esperar a que los padres presenten una denuncia formal."
                  ],
                  "correcta": 0,
                  "explicacion": "La reiteración y el desequilibrio de poder configuran acoso escolar."
                },
                {
                  "tipo": "multiple_choice",
                  "enunciado": "¿Cuál de las siguientes conductas del grupo es la más grave?",
                  "opciones": ["Insultar", "Empujar", "Esconder los útiles"],
                  "correcta": 1
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}`;

/**
 * Guía para convertir simulacros de selección múltiple (concurso docente CNSC, pruebas tipo ICFES, PDF de Google Forms…).
 * Es el mismo importador JSON que la guía de inglés, pero con reglas de limpieza y de fidelidad del texto.
 */
export const JSON_PROMPT_SIMULACROS = `Convierte el material que te voy a dar (un simulacro o examen de selección múltiple) en un JSON para importarlo en mi app de estudio. Cuida cada detalle del texto: tildes, signos, símbolos y números deben quedar IGUAL que en el original.

TU RESPUESTA tiene solo dos partes: (1) UN bloque de código con el JSON y (2) debajo, fuera del bloque, la lista "PARA REVISAR" (ver punto 9). Nada más: sin saludos ni explicaciones.

════════ 1. FORMATO ════════
Las claves van exactamente así: en minúscula, en español y SIN tildes (tipo, seccion, enunciado, opciones, correcta, explicacion, titulo, tema, orden, nombre, descripcion, lecturas, texto, preguntas, bibliotecas, simulacros, version). Los VALORES sí llevan tildes, ñ y signos como en el original.

{
  "version": 1,
  "bibliotecas": [ { "nombre": "…", "descripcion": "…", "simulacros": [ SIMULACRO ] } ]
}

SIMULACRO = { "titulo": "…", "tema": "…", "orden": 1,
  "preguntas": [ PREGUNTA ],
  "lecturas": [ { "titulo": "…", "seccion": "…", "texto": "…", "preguntas": [ PREGUNTA ] } ] }

PREGUNTA (opción múltiple, la más común):
{ "tipo": "multiple_choice", "seccion": "…", "enunciado": "…", "opciones": ["…","…","…","…"], "correcta": 0, "explicacion": "…" }

PREGUNTA (verdadero/falso):
{ "tipo": "true_false", "seccion": "…", "enunciado": "…", "correcta": true, "explicacion": "…" }

Si hay una pregunta para completar, usa "tipo": "fill_blank", con ___ (tres guiones bajos) en el enunciado y "correcta": "texto" (una lista si hay varios espacios). No uses otros tipos.

════════ 2. LIMPIA EL MATERIAL ANTES DE ESCRIBIR ════════
El texto suele venir de un PDF o de Google Forms y trae basura. NO la copies:
- Pies y encabezados de página: fechas y horas ("14/9/25, 3:04 p.m."), el título del documento repetido, direcciones web (docs.google.com…), contadores de página ("5/124", "Página 3").
- Marcas del formulario: asteriscos de "obligatorio" (*), "Total de puntos", "Correo electrónico", "Comentarios", "Respuesta correcta" (son etiquetas, no contenido).
- DATOS PERSONALES de quien resolvió el simulacro (correo, nombre, cédula, teléfono): NO los incluyas nunca, en ningún campo.
- Textos de instrucciones generales ("Preguntas de selección múltiple con única respuesta TIPO I…", "Escriba su nombre"): no son preguntas.
- Palabras cortadas por guion al final de renglón: "trans- formación" → "transformación"; "pro- puesta" → "propuesta". Une también los renglones partidos a la mitad de una frase y los espacios dobles. Un guion que pertenece a la palabra (ej. "físico-químico") se conserva.
- El número de la pregunta ("109)", "20.") NO va en el enunciado. Tampoco la letra de la opción ("A)", "b.", "C)"): la app pone sus propias letras.

════════ 3. ORDEN DEL MATERIAL (importante en PDF de Google Forms) ════════
En esos PDF cada bloque viene al revés: primero la nota ("0/1" o "1/1"), luego las opciones, luego "Respuesta correcta" y "Comentarios", y AL FINAL el enunciado numerado. Por eso las opciones pertenecen al enunciado que aparece DESPUÉS de ellas, no al de antes. Antes de escribir, empareja cada enunciado con sus opciones y revisa que el contenido tenga sentido (si las opciones no responden al enunciado, te equivocaste de bloque). La nota "0/1" o "1/1" solo dice si quien resolvió acertó: NO la uses para decidir cuál es la correcta.
Si el material viene en el orden normal (enunciado, opciones, respuesta), usa ese orden.
- Si tras las opciones aparece "Respuesta correcta" seguida de una opción (con su letra y su texto), esa opción es una REPETICIÓN de una de las de arriba: sirve para saber cuál es la correcta, pero NO la agregues como opción extra (si había 4 opciones, siguen siendo 4).
- Un enunciado o una opción puede quedar partido por un salto de página (una mitad antes del pie de página y la otra después). Únelos en un solo texto, sin repetir palabras y sin copiar el pie de página.
- No supongas que siempre hay 4 opciones: pueden ser 2, 3, 4 o 5. Copia las que haya, en su orden.

════════ 4. RESPUESTA CORRECTA ════════
- "correcta" es el NÚMERO de la opción correcta EMPEZANDO EN 0, sin comillas: A=0, B=1, C=2, D=3, E=4. NO uses letras ("B"), NO empieces en 1, NO uses texto.
- La respuesta puede aparecer escrita de muchas formas: "Respuesta: B", "Respuesta: B.", "RESPUESTA B", "Respuesta (B)", "Respuesta correcta: A", "Rta: C", "Clave: D", o el texto completo de la opción tras "Respuesta correcta". Todas valen. Si dos lugares se contradicen, no elijas: pon la pregunta en "PARA REVISAR".
- Si el material NO dice cuál es la correcta, NO la adivines ni la deduzcas con tu conocimiento. Deja esa pregunta FUERA del JSON y anótala en "PARA REVISAR".
- Solo usa una lista ("correcta": [0, 2]) si la pregunta pide marcar VARIAS opciones como respuestas independientes. Si las opciones son combinaciones ("1 y 2 son correctas", "solo I y III"), es UNA sola respuesta: un número.
- Revisa dos veces la correspondencia letra → número antes de cerrar cada pregunta.
- "explicacion" es la justificación o el comentario del material, SIN las etiquetas "Respuesta: B", "Respuesta correcta", "Justificación:" ni "Comentarios". Si el comentario solo repite la opción correcta o solo dice la letra, NO pongas "explicacion" (es opcional). Nunca inventes una explicación.

════════ 5. FIDELIDAD DEL TEXTO: TILDES, SIGNOS Y SÍMBOLOS ════════
- Copia el texto TAL CUAL: no lo resumas, no lo corrijas, no lo mejores, no lo "modernices", no cambies mayúsculas ni el orden de las opciones, no quites opciones ni agregues opciones (si hay 5, van 5).
- Lo único que puedes arreglar son los daños de extracción del punto 2 (guiones de fin de renglón, saltos de renglón, espacios dobles) y letras que el PDF rompió (ej. "ó" suelta, "n~" por "ñ"): ahí repara la letra.
- Conserva tildes, diéresis (güe, argüir), ñ, ¿ ? ¡ !, comillas «» “” ‘’, guiones largos —, puntos suspensivos y los puntos y comas.
- Escribe en UTF-8 normal. No conviertas los acentos a códigos (\\u00f3), ni los quites, ni los cambies por la vocal sin tilde.
- Símbolos científicos y matemáticos: déjalos como Unicode, igual que el original: CO₂, H₂O, H⁺, m², 10⁻³, √, ≥, ≤, ≠, ±, ×, ÷, °C, µ, Δ, α, β, →, ⇌, %, ‰. Si el original dice "CO2" sin subíndice, deja "CO2". NO uses LaTeX ($x^2$, \\frac…) ni HTML (<sub>, <b>).
- Números tal cual: si el original usa coma decimal (3,5) o separador de miles (1.250), no los cambies. Fechas, leyes y artículos igual ("Ley 1098 de 2006", "Decreto 1278", "art. 15").
- Siglas y nombres propios con su escritura original (SINEDU, ICFES, P.E.I., Colegio La Cima IED).
- Cursivas, negritas y subrayados: quita el formato pero conserva las palabras. Si una palabra en mayúscula sostenida es parte de la pregunta ("NO", "EXCEPTO", "SOLO"), déjala así: cambia el sentido.

════════ 6. JSON VÁLIDO (aquí es donde más falla) ════════
- Comillas dobles " solo para las claves y para abrir/cerrar textos. Dentro de un texto, si el original trae comillas dobles rectas ("así"), escríbelas como “así” (tipográficas) o escápalas como \\"así\\". Prefiere las tipográficas.
- UN SALTO DE LÍNEA REAL DENTRO DE UN TEXTO ROMPE EL JSON. Si necesitas un salto (lista numerada, tabla), escribe el par de caracteres \\n. Un texto = una línea física.
- No uses barras invertidas \\ para nada más que \\n y \\". Si el original trae una barra, escríbela como /.
- Sin tabuladores (usa espacios), sin comas finales, sin comentarios, sin "…" como relleno, sin "etc.", sin valores vacíos "", sin null.
- "correcta" es un número (o true/false), nunca un texto entre comillas.
- Cierra todos los corchetes y llaves. Revisa el JSON completo antes de enviarlo.
- NO uses paréntesis ( ) en lugar de corchetes [ ].
- No pongas texto fuera del bloque de código salvo la lista "PARA REVISAR".

════════ 7. LISTAS, TABLAS Y ENUNCIADOS COMPARTIDOS ════════
- Lista dentro de un enunciado ("1. Agredir… 2. Vender… 10. Portar…" y luego las opciones): es PARTE de la pregunta. Déjala dentro de "enunciado", un ítem por línea separado con \\n, conservando su numeración o sus números romanos (I., II., III.). Los ítems NO son preguntas aparte.
- Tabla en texto: pásala a líneas con \\n y columnas separadas por " | ". Si es una tabla que solo se entiende como imagen, trátala como imagen (punto 8).
- Si varias preguntas comparten un texto, caso o enunciado ("De acuerdo con la siguiente lectura responde las preguntas 1 a 4", "Lea el caso y conteste…"), NO repitas el texto en cada pregunta: ponlo UNA sola vez en "lecturas": { "titulo": "(nombre breve del texto o caso)", "seccion": "…", "texto": "(el texto, sin la frase de instrucción)", "preguntas": [ … ] } y pon dentro todas las preguntas que dependen de él. El "titulo" y "texto" son obligatorios y debe haber al menos una pregunta.
- La frase "responde las preguntas 1 a 4" es una instrucción, no es pregunta ni va en el texto.
- Las preguntas de una lectura no necesitan "seccion": heredan la de la lectura.

════════ 8. IMÁGENES ════════
No puedes ver ni reproducir imágenes. Si una pregunta depende de una figura, gráfica, mapa, esquema, tabla-imagen o fotografía (por ejemplo "observe la figura", "la siguiente gráfica", "el siguiente esquema"):
- Transcribe el enunciado completo y empieza con la marca [IMAGEN] (ej. "[IMAGEN] Observe la gráfica… ¿Qué ocurre…?").
- Si las opciones son imágenes, escribe cada opción como "[IMAGEN A]", "[IMAGEN B]"… en su orden.
- Si la imagen contiene texto o datos que puedes leer, transcríbelos en el enunciado en lugar de omitirlos.
- Anota el número de cada una en "PARA REVISAR".

════════ 9. SECCIONES Y "PARA REVISAR" ════════
- "seccion" es el área, ley, competencia o parte del examen a la que pertenece la pregunta (ej. "Biología", "Ley 1098", "Ley 1620", "Prueba pedagógica"). Escríbela IDÉNTICA (mismas mayúsculas, tildes y espacios) en todas las preguntas de esa parte, porque la app las agrupa por nombre exacto. Si todo el bloque es una sola parte, usa una sola sección.
- Después del bloque de código, escribe EXACTAMENTE esta lista (sin llaves ni corchetes):
PARA REVISAR
Total de preguntas en el material: N. Total en el JSON: M.
Sin respuesta en el material (no incluidas): números…
Con imagen: números…
Con respuestas contradictorias (no incluidas): números…
Con texto dañado o dudoso (indica qué): números…
Pon "ninguna" donde no haya. Usa el número que traía cada pregunta en el material.
- N y M deben cuadrar con lo que pusiste en las demás líneas. No omitas preguntas en silencio.
- Si el material repite o salta números de pregunta (1, 2, 2, 4…), no los "arregles" ni los renumeres: usa los que trae y anótalo en "Con texto dañado o dudoso".
- Si la respuesta es demasiado larga, termina el JSON COMPLETO (cerrando todo) con las preguntas que quepan y escribe debajo "FALTAN: desde la pregunta N". Yo te pediré que continúes con otro JSON.

════════ 10. ERRORES FRECUENTES ════════
✖ "correcta": "B"            ✔ "correcta": 1
✖ "correcta": 2 (para la B)   ✔ "correcta": 1  (A=0, B=1, C=2, D=3)
✖ "opciones": ["A) tipo I"]   ✔ "opciones": ["tipo I"]
✖ "enunciado": "109) Las siguientes acciones…"   ✔ "enunciado": "Las siguientes acciones…"
✖ un salto de renglón real dentro del texto   ✔ "enunciado": "Lea:\\n1. Primero"
✖ "enunciado": "El docente dijo "hola""   ✔ "enunciado": "El docente dijo “hola”"
✖ "enunciado": "trans- formación"   ✔ "enunciado": "transformación"
✖ "seccion": "Biologia" (sin tilde, si el material dice Biología)   ✔ "seccion": "Biología"
✖ el mismo texto de lectura copiado en cada pregunta   ✔ una "lectura" con sus "preguntas"
✖ la lista numerada del enunciado convertida en preguntas   ✔ la lista dentro del "enunciado"
✖ la respuesta deducida por ti cuando el material no la trae   ✔ la pregunta en "PARA REVISAR"

════════ 11. EJEMPLO CORRECTO ════════
${JSON_EXAMPLE_SIMULACRO}

════════ 12. DATOS DE ESTE BLOQUE Y MATERIAL ════════
BIBLIOTECA (escríbela igual en cada bloque para que se agreguen a la misma): [ej. Concurso docente - Ciencias Naturales]
SIMULACRO (título): [ej. Ciencias Naturales 1-20]
TEMA (opcional): [ej. Ciencias Naturales]
ORDEN: [ej. 1]
SECCIÓN / ÁREA de las preguntas: [ej. Biología]

MATERIAL:
[Pega aquí el texto del bloque, ya sin tus datos personales]`;
