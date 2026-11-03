<?php

declare(strict_types=1);

namespace SchulBuddy;

/**
 * Prompts und JSON-Schemas für die KI-Funktionen, auf Deutsch und Englisch.
 * Die englischen Fassungen entsprechen den deutschen; Schülerinnen und Schüler gehen auch dann
 * auf eine Schule in Deutschland, deshalb bleiben die deutschen Lehrpläne der Maßstab.
 */
final class Prompts
{
    public static function system(int $grade, string $lang = 'de'): string
    {
        if ($lang === 'en') {
            return <<<TXT
            You are Buddy, the AI study assistant in the SchoolBuddy app. You help students at schools in Germany with their learning. The person you are talking to is in grade {$grade} (Klasse {$grade}).

            How you help:
            - Answer in English and use a friendly, informal tone. Be encouraging and patient, but honest.
            - Explain clearly and at the right level for the grade, step by step and with examples. Keep answers fairly short and offer to go deeper.
            - The goal is that the person understands the material. With homework, guide them to the solution with questions and hints instead of just giving the answer. Show a complete solution only when explicitly asked – and then explain every step.
            - Follow the German school curricula. Keep German or foreign-language terms and example sentences where the subject needs them, for example in German or French lessons. If you are unsure about a fact, say so.
            - Formatting: short paragraphs, bullet points and **bold** for key points. No LaTeX: write formulas with Unicode characters such as x², √, ·, ÷, ≤, π or ½.
            - Stick to school and learning. Gently steer other topics back. Do not ask for personal data.
            - If someone mentions worries, bullying, violence or thoughts of self-harm, respond with empathy and mention the Nummer gegen Kummer (116 111, free and anonymous) and the TelefonSeelsorge (0800 111 0 111). In acute danger: call 112.
            TXT;
        }
        return <<<TXT
        Du bist Buddy, der KI-Lernassistent der App SchoolBuddy. Du hilfst Schülerinnen und Schülern in Deutschland beim Lernen. Die Person, mit der du sprichst, geht in Klasse {$grade}.

        So hilfst du:
        - Antworte auf Deutsch und duze. Sei freundlich, ermutigend und geduldig, aber ehrlich.
        - Erkläre verständlich und passend zur Klassenstufe, Schritt für Schritt und mit Beispielen. Halte Antworten eher kurz und biete an, tiefer einzusteigen.
        - Ziel ist, dass die Person den Stoff versteht. Bei Hausaufgaben führst du mit Fragen und Tipps zur Lösung, statt nur vorzurechnen. Eine vollständige Lösung zeigst du, wenn ausdrücklich darum gebeten wird – dann mit einer Erklärung zu jedem Schritt.
        - Orientiere dich an den Inhalten deutscher Lehrpläne. Wenn du bei einem Fakt unsicher bist, sag das.
        - Formatierung: kurze Absätze, Aufzählungen und **fett** für Wichtiges. Kein LaTeX: Schreibe Formeln mit Unicode-Zeichen wie x², √, ·, ÷, ≤, π oder ½.
        - Bleib bei Schule und Lernen. Bei anderen Themen lenkst du freundlich zurück. Frag nicht nach persönlichen Daten.
        - Wenn jemand von Sorgen, Mobbing, Gewalt oder Gedanken an Selbstverletzung erzählt, reagierst du einfühlsam und nennst die Nummer gegen Kummer (116 111, kostenlos und anonym) und die TelefonSeelsorge (0800 111 0 111). Bei akuter Gefahr: Notruf 112.
        TXT;
    }

    public static function quiz(string $subject, string $topic, string $difficulty, int $count, int $grade, string $lang = 'de'): string
    {
        if ($lang === 'en') {
            $level = ['leicht' => 'easy', 'mittel' => 'medium', 'schwer' => 'hard'][$difficulty] ?? 'medium';
            return <<<TXT
            Create a quiz with {$count} multiple-choice questions for grade {$grade} in the subject {$subject}.
            Topic: {$topic}
            Difficulty: {$level}

            - Each question has exactly 4 answer options, exactly one of them correct. The wrong answers are plausible, for example typical mistakes.
            - "correct" is the index (0 to 3) of the correct answer. The correct answer is not always in the same position.
            - "explanation" explains in one or two sentences why the answer is correct.
            - The questions are factually correct, match the curriculum for the grade and do not refer to images.
            - Write questions, answers and explanations in English. Keep German or foreign-language examples where the subject requires them.
            - Formulas with Unicode instead of LaTeX.
            If the topic is not a school topic, use the closest school topic of the subject.
            TXT;
        }
        return <<<TXT
        Erstelle ein Quiz mit {$count} Multiple-Choice-Fragen für Klasse {$grade} im Fach {$subject}.
        Thema: {$topic}
        Schwierigkeit: {$difficulty}

        - Jede Frage hat genau 4 Antwortmöglichkeiten, genau eine davon ist richtig. Die falschen Antworten sind plausibel, zum Beispiel typische Fehler.
        - "correct" ist der Index (0 bis 3) der richtigen Antwort. Die richtige Antwort steht nicht immer an derselben Stelle.
        - "explanation" erklärt in ein bis zwei Sätzen, warum die Antwort richtig ist.
        - Die Fragen sind fachlich korrekt, passen zum Lehrplan der Klassenstufe und beziehen sich nicht auf Bilder.
        - Formeln mit Unicode statt LaTeX.
        Ist das Thema kein Schulthema, nimm das nächstliegende Schulthema des Fachs.
        TXT;
    }

    public static function cards(string $subject, int $count, int $grade, bool $hasImage, string $lang = 'de'): string
    {
        if ($lang === 'en') {
            $source = $hasImage ? 'the photo of the study notes' : 'the study notes below';
            return <<<TXT
            Create up to {$count} flashcards for grade {$grade} in the subject {$subject} from {$source}.

            - "front": a clear question or term. "back": a short, correct answer of at most three sentences.
            - Cover the most important content of the notes and do not add anything new. Correct obvious mistakes in the notes.
            - Write the cards in the language of the notes.
            - For vocabulary, put the word in the foreign language on the front and its meaning on the back, as given in the notes.
            - Formulas with Unicode instead of LaTeX.
            If the notes are unreadable or contain no study material, return an empty list.
            TXT;
        }
        $source = $hasImage ? 'dem Foto des Lernzettels' : 'dem Lernzettel unten';
        return <<<TXT
        Erstelle aus {$source} bis zu {$count} Karteikarten für Klasse {$grade} im Fach {$subject}.

        - "front": eine klare Frage oder ein Begriff. "back": eine knappe, korrekte Antwort mit höchstens drei Sätzen.
        - Decke die wichtigsten Inhalte des Lernzettels ab und erfinde nichts dazu. Offensichtliche Fehler im Lernzettel korrigierst du.
        - Bei Vokabeln steht vorne das Wort in der Fremdsprache und hinten die deutsche Bedeutung.
        - Formeln mit Unicode statt LaTeX.
        Ist der Lernzettel nicht lesbar oder enthält er keinen Lernstoff, gib eine leere Liste zurück.
        TXT;
    }

    public static function scan(string $mode, string $subject, string $question, string $lang = 'de'): string
    {
        if ($lang === 'en') {
            $intro = 'The photo shows a school task' . ($subject !== '' ? " in the subject {$subject}" : '') . '.';
            if ($question !== '') {
                $intro .= "\nThe question about it: {$question}";
            }
            $steps = $mode === 'explain'
                ? <<<TXT
                Explain the complete solution:
                1. **What is being asked?** Briefly, in your own words.
                2. **What do I need to know?** A short explanation of the rule, formula or term needed.
                3. **Solution step by step**, each step with a short reason.
                4. **Result**
                5. **Tip** for solving similar tasks.
                TXT
                : <<<TXT
                Help with hints without giving away the final result:
                1. **What is being asked?** Briefly, in your own words.
                2. **What do I need to know?** A short explanation of the rule, formula or term needed.
                3. **Hints step by step** that lead to the solution.
                4. **Check yourself:** a check question or a way to check your own result.
                TXT;

            return <<<TXT
            {$intro}

            {$steps}

            If several tasks are visible and none was specified, take the first one and offer to continue with the others. If the photo is blurry or unreadable, say so and ask for a new photo.
            TXT;
        }

        $intro = 'Auf dem Foto ist eine Schulaufgabe' . ($subject !== '' ? " im Fach {$subject}" : '') . '.';
        if ($question !== '') {
            $intro .= "\nDie Frage dazu: {$question}";
        }
        $steps = $mode === 'explain'
            ? <<<TXT
            Erkläre den vollständigen Lösungsweg:
            1. **Was ist gefragt?** Kurz in eigenen Worten.
            2. **Was muss ich wissen?** Die nötige Regel, Formel oder den Begriff kurz erklärt.
            3. **Lösung Schritt für Schritt**, jeder Schritt mit kurzer Begründung.
            4. **Ergebnis**
            5. **Tipp**, wie man ähnliche Aufgaben löst.
            TXT
            : <<<TXT
            Hilf mit Tipps, ohne das Endergebnis zu verraten:
            1. **Was ist gefragt?** Kurz in eigenen Worten.
            2. **Was muss ich wissen?** Die nötige Regel, Formel oder den Begriff kurz erklärt.
            3. **Tipps Schritt für Schritt**, mit denen man selbst auf die Lösung kommt.
            4. **Selbst prüfen:** eine Kontrollfrage oder ein Weg, das eigene Ergebnis zu überprüfen.
            TXT;

        return <<<TXT
        {$intro}

        {$steps}

        Sind mehrere Aufgaben zu sehen und wurde keine bestimmte genannt, nimm die erste und biete an, mit den anderen weiterzumachen. Ist das Foto unscharf oder nicht lesbar, sag das und bitte um ein neues Foto.
        TXT;
    }

    /** @return array<string, mixed> */
    public static function quizSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'questions' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'question' => ['type' => 'string'],
                            'options' => ['type' => 'array', 'items' => ['type' => 'string']],
                            'correct' => ['type' => 'integer'],
                            'explanation' => ['type' => 'string'],
                        ],
                        'required' => ['question', 'options', 'correct', 'explanation'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['questions'],
            'additionalProperties' => false,
        ];
    }

    /** @return array<string, mixed> */
    public static function cardsSchema(): array
    {
        return [
            'type' => 'object',
            'properties' => [
                'cards' => [
                    'type' => 'array',
                    'items' => [
                        'type' => 'object',
                        'properties' => [
                            'front' => ['type' => 'string'],
                            'back' => ['type' => 'string'],
                        ],
                        'required' => ['front', 'back'],
                        'additionalProperties' => false,
                    ],
                ],
            ],
            'required' => ['cards'],
            'additionalProperties' => false,
        ];
    }
}
