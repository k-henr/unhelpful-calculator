import { Parser } from "./parser";

export class CalculatorError extends Error {
    constructor(message: string) {
        super(message);
    }
}

export type ErrorCallback = {
    name: string;
    callback: () => void;
};

export class LazyError extends CalculatorError {
    options: ErrorCallback[] = [];
    constructor(message: string, options: ErrorCallback[]) {
        super(message);
        this.options = options;
    }
}

export type CalculatorContext = {
    variables: { [key: string]: Expression };
    functions: { [key: string]: Expression };
};

export class Expression {
    calculator: Calculator;

    element: HTMLElement | null = null;
    resultElement: HTMLElement | null = null;
    errorWrapper: HTMLElement | null = null;
    errorPopup: HTMLElement | null = null;

    definedFunction: string | null = null;
    arguments: string[] = []; // Stores function arguments if this is a function. Kinda yucky

    definedVariable: string | null = null;

    expressionContent: string = ""; // Just the epxression itself, i.e. "5+x" in "f(x)=5+x"
    expressionString: string; // Stores the full string of this expression, including declarations
    value: number;

    // Gradually lowers when retrying
    complexityMultiplier = 1;
    coffeeMode: boolean;

    usedBy: Set<Expression> = new Set();

    template = document.querySelector(
        "#expression-template",
    ) as HTMLTemplateElement;

    errorButtonTemplate = document.querySelector(
        "#error-button-template",
    ) as HTMLTemplateElement;

    constructor(
        calculator: Calculator,
        expressionString: string,
        addVisual: boolean = true,
        coffeeMode: boolean = false, // whether laziness is possible
    ) {
        this.calculator = calculator;
        this.expressionString = expressionString;

        this.coffeeMode = coffeeMode;
        this.value = 0;

        if (coffeeMode) this.complexityMultiplier = 0;

        if (addVisual) {
            this.element = (
                this.template.content.cloneNode(true) as HTMLElement
            ).querySelector(".expression")!;

            this.resultElement =
                this.element.querySelector(".expression-result")!;
            if (this.resultElement === null)
                throw new CalculatorError(
                    "Result element not found on expression template!",
                );

            this.errorWrapper = this.element.querySelector(
                ".expression-error-wrapper",
            )!;
            if (this.errorWrapper === null)
                throw new CalculatorError(
                    "Error element not found on expression template!",
                );

            this.errorPopup = this.element.querySelector(
                ".expression-error-popup",
            )!;
            if (this.errorPopup === null)
                throw new CalculatorError(
                    "Error popup not found on expression template!",
                );

            // Add a listener to set the contents of the expression when it changes
            (this.element.querySelector(
                ".expression-edit-field",
            ) as HTMLInputElement)!.onchange = (e) => {
                const target = e.target as HTMLInputElement;
                this.setContent(target.value);
            };

            // Add a listener for opening an error screen
            this.errorWrapper.onclick = () => {
                this.errorPopup?.classList.toggle("hidden");
            };

            // Add a listener for removing the expression when the cross is clicked
            (this.element.querySelector(
                ".remove-expression",
            ) as HTMLElement)!.onclick = () => {
                calculator.removeExpression(this);
            };

            // Add the graphical expression to the DOM
            calculator.expressionListElement.appendChild(this.element);
        }

        this.setContent(expressionString);
    }

    showError = (errorText: string) => {
        this.errorWrapper?.classList.remove("hidden");
        if (this.errorPopup) this.errorPopup.innerText = errorText;
    };

    hideError = () => {
        this.errorWrapper?.classList.add("hidden");
        if (this.errorPopup) {
            this.errorPopup.innerHTML = "";
            this.errorPopup.classList.add("hidden");
        }
    };

    showResult = (resultText: string) => {
        if (this.resultElement) {
            this.resultElement.innerText = resultText;
            this.resultElement.classList.remove("hidden");
        }
    };

    hideResult = () => {
        this.resultElement?.classList.add("hidden");
    };

    getRoundedString = (x: number): string => {
        // TODO: Smarter rounding with significant digits
        return String(Math.round(x * 1e6) / 1e6);
    };

    setContent = (newContent: string) => {
        this.expressionString = newContent;
        this.update();
    };

    update = () => {
        this.hideError();
        this.hideResult();

        try {
            // FUNCTION MATCHER:
            // /^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)$/gmi

            // VARIABLE MATCHER:
            // /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$/gmi

            // If none of the above match, the expression is assumes to be a standalone expression.

            const typeMatcher =
                /^\s*(?<VRNAME>[a-z]\w*)\s*=\s*(?<VRDEF>.*)$|^\s*(?<FNNAME>[a-z]\w*)\s*\(\s*(?<FNARGS>(?:[a-z]\w*(?:\s*,\s*[a-z]\w*\s*)*)?)\s*\)\s*=\s*(?<FNDEF>.*)/im;

            const typeMatch = this.expressionString.match(typeMatcher);

            if (typeMatch) {
                if (!typeMatch.groups)
                    throw new Error("Pre-evaluation regex match failed!");

                const { groups } = typeMatch;

                // Delete any old variable or function that this expression defined
                if (this.definedVariable) {
                    delete this.calculator.globalContext.variables[
                        this.definedVariable
                    ];
                } else if (this.definedFunction) {
                    delete this.calculator.globalContext.functions[
                        this.definedFunction
                    ];
                }

                // Check if the field declaration is a function or a variable
                if (groups.FNNAME) {
                    // Was a function. Don't evaluate, just store in the global calculator context
                    const fns = this.calculator.globalContext.functions;
                    if (fns[groups.FNNAME]) {
                        throw new CalculatorError(
                            `Function "${groups.FNNAME}" is already defined!`,
                        );
                    }
                    fns[groups.FNNAME] = this;
                    this.definedFunction = groups.FNNAME;
                    this.arguments = groups.FNARGS.split(",").map((e) =>
                        e.trim(),
                    );
                    this.expressionContent = groups.FNDEF;
                } else {
                    // Was a variable. Compute value, store self in global context
                    const vars = this.calculator.globalContext.variables;
                    if (vars[groups.VRNAME]) {
                        throw new CalculatorError(
                            `Variable ${groups.VRNAME} is already defined!`,
                        );
                    }
                    vars[groups.VRNAME] = this;
                    this.definedVariable = groups.VRNAME;

                    // Calculate the value of this expression
                    this.expressionContent = groups.VRDEF;
                    this.value = this.getValue(
                        this,
                        this.calculator.globalContext,
                    );

                    // Show the result
                    this.showResult(
                        `${this.definedVariable} = ${this.getRoundedString(this.value)}`,
                    );
                }

                // Reevaluate all expressions that used this field
                for (const user of this.usedBy) {
                    user.update();
                }
            } else {
                this.expressionContent = this.expressionString;
                this.value = this.getValue(this, this.calculator.globalContext);
                this.showResult(this.getRoundedString(this.value));
            }

            // Reset complexity multiplier if parse succeeded
            if (!this.coffeeMode) this.complexityMultiplier = 1;
        } catch (e) {
            // Don't catch if this expression doesn't have a visual to error on
            if (!this.element) throw e;

            if (e instanceof CalculatorError) {
                // Set error text to message
                this.showError("ERROR: " + e.message);

                // If it's a LazyError, add the option buttons with associated callbacks
                if (e instanceof LazyError) {
                    // Add response buttons
                    for (const option of e.options) {
                        // Create a new button
                        const button =
                            this.errorButtonTemplate.content.cloneNode(
                                true,
                            ) as HTMLElement;

                        const buttonElement =
                            button.firstElementChild as HTMLElement;
                        buttonElement.setAttribute("value", option.name);
                        buttonElement.onclick = option.callback;

                        this.errorPopup?.appendChild(button);
                    }
                }
            } else if (e instanceof Error) {
                // Set error text to "INTERNAL ERROR: "+message
                this.showError("INTERNAL ERROR: \n" + e.message);
            }
        }
    };

    getValue(
        requestingExpression: Expression,
        context: CalculatorContext,
    ): number {
        return new Parser(this.expressionContent).evaluate(
            requestingExpression,
            context,
        );
    }
}

export class Calculator {
    expressionListElement: HTMLElement;

    // fieldDefinitions: { [key: string]: Expression } = {};

    globalContext: CalculatorContext = {
        functions: {},
        variables: {
            TAU: new Expression(
                this,
                "6.28318530717958647692528676655901",
                false,
                true,
            ),
        },
    };

    constructor(expressionList: HTMLElement) {
        this.expressionListElement = expressionList;
    }

    /**
     * Add a new, empty expression to this calculator.
     */
    addExpression() {
        const expression = new Expression(this, "");
    }

    /**
     * Remove the given expression.
     * @param expression The expression to remove
     */
    removeExpression(expression: Expression) {
        // Remove the element visual
        if (expression.element)
            this.expressionListElement.removeChild(expression.element);

        // Remove any field definitions from the expression
        if (expression.definedFunction) {
            delete this.globalContext.functions[expression.definedFunction];
        } else if (expression.definedVariable) {
            delete this.globalContext.functions[expression.definedVariable];
        }
    }

    /**
     * Set the content of the given expression to something new.
     * @param expression The expression to change
     * @param newValue The new content of this expression
     */
    setExpressionContent(expression: Expression, newValue: string) {
        expression.setContent(newValue);
    }
}
