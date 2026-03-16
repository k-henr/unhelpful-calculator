import {
    CalculatorContext,
    CalculatorContextLayer,
    CalculatorError,
    Expression,
    LazyError,
} from "./calculator";

export class Parser {
    inputString: string;

    tokens: Token[] | null = null;
    peek(): Token {
        return this.tokens![this.tokens!.length - 1];
    }
    pop(): Token {
        return this.tokens!.pop()!;
    }
    expect(type: TokenType): Token {
        const token = this.pop()!;
        if (token.type !== type)
            throw new CalculatorError(
                `Expected type ${type} but got ${token.type}!`,
            );
        return token;
    }

    astTree: DirtyAstTreeNode = 0;

    constructor(inputString: string) {
        this.inputString = inputString;
    }

    evaluate(
        requestingExpression: Expression,
        context: CalculatorContext,
    ): number {
        this.tokenize();
        // console.log([...this.tokens!]);
        this.buildTree();
        // console.log(this.astTree);
        return this.evaluateTree(requestingExpression, context, this.astTree);
    }

    /**
     * Tokenize this parser's expression.
     */
    tokenize() {
        const matchedTokens = this.inputString.matchAll(tokenizer);

        const tokens: (Token | VariableToken | NumberToken | FunctionToken)[] =
            [];
        for (const match of matchedTokens) {
            const { groups } = match;
            if (!groups) continue; // Ignore empty matches to get rid of warning

            // Find the type, chosen by the first group that matched
            const type = tokenPatterns.find(
                ({ type }) => groups[type] !== undefined,
            )?.type;
            if (!type) continue; // get rid of warning

            // Add the token, and additional info if needed
            switch (type) {
                case "FUN":
                    tokens.unshift({
                        type,
                        functionName: groups.FNNAME,
                        functionArguments: groups.FNARGS.split(",").map((e) =>
                            e.trim(),
                        ),
                    });
                    break;
                case "VAR":
                    tokens.unshift({ type, variableName: groups[type] });
                    break;
                case "NUM":
                    tokens.unshift({ type, value: Number(groups[type]) });
                    break;
                case "INVALID":
                    throw new CalculatorError(
                        `Invalid token '${groups[type]}'!`,
                    );
                default:
                    tokens.unshift({ type });
            }
        }

        tokens.unshift({ type: "END" });

        this.tokens = tokens;
    }

    // Convert to AST tree
    buildTree() {
        if (!this.tokens)
            throw new CalculatorError(
                "Expression tried to parse before being tokenized!",
            );

        // Special case for empty expressiont
        if (this.peek().type === "END") {
            this.astTree = 0;
        } else {
            this.astTree = this.getExpression();
        }
    }

    getExpression(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getTerm();

        const tokenChecks: TokenType[] = ["ADD", "SUB"];
        while (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getTerm();
            value1 = {
                operator,
                value1,
                value2,
            };
        }

        // If the next token isn't RPAREN or END, the expression is malformed
        const t = this.peek().type;
        if (t !== "END" && t !== "RPAREN") {
            throw new CalculatorError("Expected RPAREN or END but got " + t);
        }

        return value1;
    }

    getTerm(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getFactor();

        const tokenChecks: TokenType[] = ["MUL", "DIV"];
        while (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getTerm();
            value1 = {
                operator,
                value1,
                value2,
            };
        }
        return value1;
    }

    // Exponentiation (right-associative)
    getFactor(): DirtyAstTreeNode {
        let value1: DirtyAstTreeNode = this.getUnary();

        const tokenChecks: TokenType[] = ["EXP"];
        if (tokenChecks.includes(this.peek().type)) {
            const operator = this.pop().type;
            const value2 = this.getFactor(); // right-associativity requires recursion rather than loops
            value1 = {
                operator,
                value1,
                value2,
            };
        }
        return value1;
    }

    // Unary minus
    getUnary(): DirtyAstTreeNode {
        if (this.peek().type === "SUB") {
            this.pop();
            return { operator: "SUB", value1: 0, value2: this.getPrimary() };
        } else return this.getPrimary();
    }

    getPrimary(): DirtyAstTreeNode {
        const t = this.pop();
        if (t.type === "NUM") {
            return (t as NumberToken).value;
        }
        if (t.type === "VAR") {
            return (t as VariableToken).variableName;
        }
        if (t.type === "FUN") {
            const token: FunctionToken = t as FunctionToken;
            return token; // They have the exact same signature atm ¯\_(ツ)_/¯
        }
        if (t.type === "LPAREN") {
            const expr = this.getExpression();
            this.expect("RPAREN");
            return expr;
        }
        throw new CalculatorError(`Unexpected token ${t.type}`);
    }

    evaluateTree(
        requestingExpression: Expression,
        context: CalculatorContext,
        node: DirtyAstTreeNode | undefined,
    ): number {
        if (node === undefined) return 0;

        if (typeof node === "string") {
            const dependency = context.getVariable(node);
            if (!dependency)
                throw new CalculatorError(`Variable "${node}" not found!`);

            dependency.usedBy.add(requestingExpression);
            return dependency.value;
        }
        if (typeof node === "number") {
            return Number(node);
        }

        // Kinda yucky check for if it's a function node
        if ("functionName" in node) {
            node = node as FunctionNode;

            // Get the referenced expression
            const e = context.getFunction(node.functionName);
            if (!e)
                throw new CalculatorError(
                    `Function "${node.functionName}" not found!`,
                );
            if (node.functionArguments.length !== e.arguments.length)
                throw new CalculatorError(
                    `Argument count of ${node.functionName} is ${node.functionArguments.length}; expected ${e.arguments.length}`,
                );

            // Mark this expression as using the function's expression
            e.usedBy.add(requestingExpression);

            // Add a new context layer for this function call (allows wackscoping atm)
            const functionLayer: CalculatorContextLayer = {
                variables: {},
                functions: {},
            };

            for (const i in e.arguments) {
                // Parse argument expression
                functionLayer.variables[e.arguments[i]] = new Expression(
                    requestingExpression.calculator,
                    node.functionArguments[i],
                    false,
                    false,
                    requestingExpression,
                );
            }

            // Create a new context with this additional layer
            const functionContext = context.copy();
            functionContext.addLayer(functionLayer);

            // Evaluate and return the function's value
            return e.getValue(requestingExpression, functionContext);
        }

        node = node as AstTreeNode;

        const v1 = this.evaluateTree(
            requestingExpression,
            context,
            node.value1,
        );
        const v2 = this.evaluateTree(
            requestingExpression,
            context,
            node.value2,
        );

        const v1Len = String(v1).length;
        const v2Len = String(v2).length;

        switch (node.operator) {
            case "ADD":
                this.checkGiveUp(
                    requestingExpression,
                    0.2 * Math.min(v1Len + 0.1 * v2Len, v2Len + 0.1 * v1Len),
                    [
                        "Adding big numbers is boring",
                        "Couldn't you add those things instead?",
                        "Forgot how addition works",
                    ],
                );
                return v1 + v2;

            case "SUB":
                this.checkGiveUp(
                    requestingExpression,
                    0.4 * Math.min(v1Len, v2Len),
                    [
                        "Calculator doesn't like subtraction",
                        "Too tired to figure out the carry rules",
                        "Scared of negative numbers",
                    ],
                );
                return v1 - v2;

            case "DIV":
                this.checkGiveUp(requestingExpression, 0.5 * v2Len, [
                    "Division is difficult",
                    "Forgot which one was the numerator",
                    "Doesn't want to risk infinite decimals",
                    "Too tired to try long division",
                ]);
                return v1 / v2;

            case "MUL":
                this.checkGiveUp(
                    requestingExpression,
                    0.5 * Math.max(v1Len, v2Len),
                    [
                        "Multiplication too difficult to do without pen and paper",
                        "That's a lot of numbers to multiply",
                        "Calculator isn't sure how lattice multiplication works; Scared of doing it wrong",
                    ],
                );
                return v1 * v2;

            case "EXP":
                this.checkGiveUp(
                    requestingExpression,
                    0.8 * Math.max(0.75 * v1Len, (v2Len - 1) * v2Len),
                    [
                        "Exponents are too difficult",
                        "Could you try to simplify the exponent a bit?",
                        "Calculator last did powers in high school; never practiced since",
                    ],
                );
                return Math.pow(v1, v2);
        }

        throw new Error("Unknown operator " + node.operator); // Something weird happened!
    }

    checkGiveUp(expression: Expression, chance: number, errorTexts: string[]) {
        if (Math.random() < chance * expression.complexityMultiplier) {
            const buttonContents = [
                "Try again!",
                "You can do this!",
                "Keep trying!",
                "Keep going!",
            ];

            const universalComplaints = [
                "Do I really need to do this?",
                "Calculator zoned out",
                "Calculator is tired today",
                "Maths is hard",
                "When will you ever use this in real life?",
                "Calculator too tired",
                "Calculator couldn't be bothered",
            ];

            const combinedErrorTexts = universalComplaints.concat(errorTexts);

            throw new LazyError(
                combinedErrorTexts[
                    Math.floor(Math.random() * combinedErrorTexts.length)
                ],
                [
                    {
                        name: buttonContents[
                            Math.floor(Math.random() * buttonContents.length)
                        ],
                        callback: () => {
                            expression.complexityMultiplier *= 0.75;
                            expression.update();
                        },
                    },
                ],
            );
        }
    }
}

// This is where tokens types are defined, by a matcher and a type
const tokenPatterns: { pattern: RegExp; type: TokenType }[] = [
    {
        pattern: /(?<FUN>(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>.*)\s*\))/,
        type: "FUN",
    },
    { pattern: /(?<VAR>[a-z]\w*)/, type: "VAR" },
    { pattern: /(?<NUM>\d+(\.\d+)?)/, type: "NUM" },
    { pattern: /(?<ADD>\+)/, type: "ADD" },
    { pattern: /(?<SUB>-)/, type: "SUB" },
    { pattern: /(?<MUL>\*)/, type: "MUL" },
    { pattern: /(?<DIV>\/)/, type: "DIV" },
    { pattern: /(?<EXP>\^)/, type: "EXP" },
    { pattern: /(?<LPAREN>\()/, type: "LPAREN" },
    { pattern: /(?<RPAREN>\))/, type: "RPAREN" },
    { pattern: /(?<INVALID>[^\s])/, type: "INVALID" },
];

// Combine the token matchers to get a single tokenizer
const tokenizer = new RegExp(
    tokenPatterns.map(({ pattern }) => pattern.source).join("|"),
    "gim",
);

type TokenType =
    | "FUN"
    | "VAR"
    | "NUM"
    | "ADD"
    | "SUB"
    | "MUL"
    | "DIV"
    | "EXP"
    | "LPAREN"
    | "RPAREN"
    | "END"
    | "INVALID";
type Token = {
    type: TokenType;
};
type NumberToken = Token & { value: number };
type VariableToken = Token & { variableName: string };
type FunctionToken = Token & {
    functionName: string;
    functionArguments: string[];
};

type AstTreeNode = {
    operator: TokenType;
    value1?: DirtyAstTreeNode;
    value2?: DirtyAstTreeNode;
};
type FunctionNode = {
    functionName: string;
    functionArguments: string[];
};
type DirtyAstTreeNode = AstTreeNode | number | string | FunctionNode;
