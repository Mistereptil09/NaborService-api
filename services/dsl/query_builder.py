# ============================================================
# dsl_service/query_builder.py
# Responsabilité : transformer l'AST produit par parser.py
#                  en un query object MongoDB concret
# Isolation totale : aucune dépendance PLY
# ============================================================

# Mapping opérateurs DSL → opérateurs MongoDB
_OP_MAP = {
    '=':  None,      # égalité directe → pas d'opérateur wrapping
    '!=': '$ne',
    '<':  '$lt',
    '>':  '$gt',
    '<=': '$lte',
    '>=': '$gte',
}

# Plafond absolu sur le LIMIT (doublé ici depuis FastAPI pour défense en profondeur)
_MAX_LIMIT = 500


def build_query(ast: dict) -> dict:
    """
    Entrée  : AST produit par parser.py
    Sortie  : {
        collection : str,
        filter     : dict (filtre MongoDB),
        order      : dict | None ({ field: 1|-1 }),
        limit      : int,
        projection : dict  (champs sensibles exclus d'office)
    }
    """
    filter_doc  = _build_condition(ast['condition']) if ast['condition'] else {}
    order_doc   = _build_order(ast['order'])          if ast['order']     else None
    limit       = min(ast['limit'] or 100, _MAX_LIMIT)

    return {
        'collection': ast['collection'],
        'filter':     filter_doc,
        'order':      order_doc,
        'limit':      limit,
        'projection': _SENSITIVE_PROJECTION,
    }


# ── Projection champs sensibles ───────────────────────────
# Appliquée systématiquement sur TOUS les résultats,
# quelle que soit la requête DSL.
_SENSITIVE_PROJECTION = {
    'content_encrypted': 0,   # messages chiffrés
    'iv':                0,   # vecteur d'initialisation AES
    'auth_tag':          0,   # tag d'authentification GCM
    'data':              0,   # BinData médias (avatars, photos)
    'pdf':               0,   # PDFs contractuels bruts
    'qr_png':            0,   # QR codes binaires
    'signature.canvas_b64': 0,  # signatures manuscrites
    'signature.signed_ip':  0,  # IP de signature
}


# ── Construction récursive du filtre ─────────────────────

def _build_condition(node: dict) -> dict:
    t = node['type']

    if t == 'and':
        return {'$and': [_build_condition(node['left']),
                          _build_condition(node['right'])]}

    if t == 'or':
        return {'$or': [_build_condition(node['left']),
                         _build_condition(node['right'])]}

    if t == 'not':
        return {'$nor': [_build_condition(node['expr'])]}

    if t == 'compare':
        return _build_compare(node['field'], node['op'], node['value'])

    if t == 'contains':
        # CONTAINS → $elemMatch sur tableau de valeurs scalaires
        return {node['field']: {'$elemMatch': {'$eq': node['value']}}}

    if t == 'is_null':
        return {node['field']: None}

    if t == 'is_not_null':
        return {node['field']: {'$ne': None}}

    raise ValueError(f"Nœud AST inconnu : '{t}'")


def _build_compare(field: str, op: str, value) -> dict:
    mongo_op = _OP_MAP.get(op)
    if mongo_op is None:
        # Opérateur = → égalité directe sans wrapping
        return {field: value}
    return {field: {mongo_op: value}}


def _build_order(node: dict) -> dict:
    direction = 1 if node['direction'].upper() == 'ASC' else -1
    return {node['field']: direction}
