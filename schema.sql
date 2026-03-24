-- 1. Tabelle
CREATE TABLE ingredienti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    unita TEXT NOT NULL,
    prezzo_attuale NUMERIC NOT NULL,
    data_aggiornamento DATE NOT NULL
);

CREATE TABLE ricette (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    porzioni INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE ricetta_ingredienti (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ricetta_id UUID NOT NULL REFERENCES ricette(id) ON DELETE CASCADE,
    ingrediente_id UUID NOT NULL REFERENCES ingredienti(id) ON DELETE CASCADE,
    quantita NUMERIC NOT NULL
);

CREATE TABLE menu (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    nome TEXT NOT NULL,
    prezzo_vendita NUMERIC NOT NULL
);

CREATE TABLE menu_ricette (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_id UUID NOT NULL REFERENCES menu(id) ON DELETE CASCADE,
    ricetta_id UUID NOT NULL REFERENCES ricette(id) ON DELETE CASCADE
);
