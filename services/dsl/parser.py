# ============================================================
# dsl_service/parser.py
# Responsabilité : grammaire PLY → production d'un AST
# Ne contient aucune logique MongoDB — délégué à query_builder.py
# ============================================================

import ply.yacc as yacc
from lexer import tokens, lexer   # noqa: F401 — tokens doit être visible par PLY
from query_builder import build_query

precedence = (
    ('left',  'OR'),
    ('left',  'AND'),
    ('right', 'NOT'),
)

# ── Grammaire ───────────────────────────────────────────────
#
#   query        : FIND collection [WHERE condition] [ORDER BY ...] [LIMIT N]
#
#   condition    : condition AND condition
#                | condition OR condition
#                | NOT condition
#                | LPAREN condition RPAREN
#                | predicate
#
#   predicate    : IDENTIFIER op value
#                | IDENTIFIER CONTAINS STRING
#                | IDENTIFIER IS NULL
#                | IDENTIFIER IS NOT NULL
#
#   op           : EQ | NEQ | LT | GT | LTE | GTE
#   value        : STRING | NUMBER
#   order        : ORDER BY IDENTIFIER ASC | DESC
#   limit        : LIMIT NUMBER | (default 100)
# ─────────────────────────────────────────────────────────────

def p_query_full(p):
    'query : FIND IDENTIFIER WHERE condition order limit'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': p[4], 'order': p[5], 'limit': p[6]}

def p_query_where_order(p):
    'query : FIND IDENTIFIER WHERE condition order'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': p[4], 'order': p[5], 'limit': 100}

def p_query_where_limit(p):
    'query : FIND IDENTIFIER WHERE condition limit'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': p[4], 'order': None, 'limit': p[5]}

def p_query_where_only(p):
    'query : FIND IDENTIFIER WHERE condition'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': p[4], 'order': None, 'limit': 100}

def p_query_order_limit(p):
    'query : FIND IDENTIFIER order limit'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': None, 'order': p[3], 'limit': p[4]}

def p_query_limit(p):
    'query : FIND IDENTIFIER limit'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': None, 'order': None, 'limit': p[3]}

def p_query_bare(p):
    'query : FIND IDENTIFIER'
    p[0] = {'type': 'query', 'collection': p[2],
             'condition': None, 'order': None, 'limit': 100}

# ── Conditions ──────────────────────────────────────────────

def p_condition_and(p):
    'condition : condition AND condition'
    p[0] = {'type': 'and', 'left': p[1], 'right': p[3]}

def p_condition_or(p):
    'condition : condition OR condition'
    p[0] = {'type': 'or', 'left': p[1], 'right': p[3]}

def p_condition_not(p):
    'condition : NOT condition'
    p[0] = {'type': 'not', 'expr': p[2]}

def p_condition_paren(p):
    'condition : LPAREN condition RPAREN'
    p[0] = p[2]

def p_condition_predicate(p):
    'condition : predicate'
    p[0] = p[1]

# ── Prédicats ───────────────────────────────────────────────

def p_predicate_op(p):
    """predicate : IDENTIFIER EQ value
                 | IDENTIFIER NEQ value
                 | IDENTIFIER LT value
                 | IDENTIFIER GT value
                 | IDENTIFIER LTE value
                 | IDENTIFIER GTE value"""
    p[0] = {'type': 'compare', 'field': p[1], 'op': p[2], 'value': p[3]}

def p_predicate_contains(p):
    'predicate : IDENTIFIER CONTAINS STRING'
    p[0] = {'type': 'contains', 'field': p[1], 'value': p[3]}

def p_predicate_is_null(p):
    'predicate : IDENTIFIER IS NULL'
    p[0] = {'type': 'is_null', 'field': p[1]}

def p_predicate_is_not_null(p):
    'predicate : IDENTIFIER IS NOT NULL'
    p[0] = {'type': 'is_not_null', 'field': p[1]}

# ── Valeurs ─────────────────────────────────────────────────

def p_value_string(p):
    'value : STRING'
    p[0] = p[1]

def p_value_number(p):
    'value : NUMBER'
    p[0] = p[1]

# ── ORDER BY ────────────────────────────────────────────────

def p_order(p):
    """order : ORDER BY IDENTIFIER ASC
             | ORDER BY IDENTIFIER DESC"""
    p[0] = {'type': 'order', 'field': p[3], 'direction': p[4]}

# ── LIMIT ───────────────────────────────────────────────────

def p_limit_explicit(p):
    'limit : LIMIT NUMBER'
    p[0] = int(p[2])

def p_limit_empty(p):
    'limit : empty'
    p[0] = 100

def p_empty(p):
    'empty :'
    pass

# ── Erreur de syntaxe ───────────────────────────────────────

def p_error(p):
    if p:
        raise ValueError(f"Erreur de syntaxe near '{p.value}' (token {p.type})")
    raise ValueError("Fin de requête inattendue — requête incomplète")

# ── Instance exportée ───────────────────────────────────────
_parser = yacc.yacc()

def parse(query: str) -> dict:
    ast = _parser.parse(query, lexer=lexer.clone())
    return build_query(ast)
