<?php

declare(strict_types=1);

namespace SchulBuddy;

/** Prompts und JSON-Schemas für die KI-Funktionen. */
final class Prompts
{
    public static function system(int $grade): string
    {
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

    public static function quiz(string $subject, string $topic, string $difficulty, int $count, int $grade): string
    {
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

    public static function cards(string $subject, int $count, int $grade, bool $hasImage): string
    {
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

    public static function scan(string $mode, string $subject, string $question): string
    {
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
