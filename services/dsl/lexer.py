# ============================================================
# dsl_service/lexer.py
# Responsabilité : définition des tokens et règles lexicales
# Ne contient aucune logique de parsing ni de génération de requête
# ============================================================

import ply.lex as lex

# ── Mots réservés ─────────────────────────────────────────
reserved = {
    'FIND':     'FIND',
    'IN':       'IN',
    'WHERE':    'WHERE',
    'AND':      'AND',
    'OR':       'OR',
    'NOT':      'NOT',
    'ORDER':    'ORDER',
    'BY':       'BY',
    'ASC':      'ASC',
    'DESC':     'DESC',
    'LIMIT':    'LIMIT',
    'CONTAINS': 'CONTAINS',
    'IS':       'IS',
    'NULL':     'NULL',
}

# ── Liste complète des tokens (importée par parser.py) ────
tokens = list(reserved.values()) + [
    'IDENTIFIER',
    'STRING',
    'NUMBER',
    'EQ',       # =
    'NEQ',      # !=
    'LTE',      # <=
    'GTE',      # >=
    'LT',       # <
    'GT',       # >
    'LPAREN',   # (
    'RPAREN',   # )
]

# ── Règles simples (regex) ────────────────────────────────
# Ordre important : LTE avant LT, GTE avant GT (PLY essaie dans l'ordre déclaré)
t_LTE     = r'<='
t_GTE     = r'>='
t_NEQ     = r'!='
t_EQ      = r'='
t_LT      = r'<'
t_GT      = r'>'
t_LPAREN  = r'\('
t_RPAREN  = r'\)'
t_ignore  = ' \t\n'

# ── Règles avec actions ───────────────────────────────────

def t_STRING(t):
    r'"([^"\\]|\\.)*"'
    t.value = t.value[1:-1]   # retirer les guillemets entourants
    return t

def t_NUMBER(t):
    r'\d+(\.\d+)?'
    t.value = float(t.value) if '.' in t.value else int(t.value)
    return t

def t_IDENTIFIER(t):
    r'[a-zA-Z_][a-zA-Z0-9_.]*'
    # Résolution mot réservé : insensible à la casse (WHERE = where = Where)
    t.type = reserved.get(t.value.upper(), 'IDENTIFIER')
    if t.type != 'IDENTIFIER':
        t.value = t.value.upper()   # normalise les mots réservés en majuscules
    return t

def t_error(t):
    raise ValueError(f"Caractère illégal : '{t.value[0]}' "
                     f"(position {t.lexpos})")

# ── Instance exportée ─────────────────────────────────────
# Ne pas utiliser directement — appeler lexer.clone() dans le parser
# pour garantir le thread-safety en cas de requêtes concurrentes
lexer = lex.lex()
