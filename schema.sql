-- ==============================================================================
-- SISTEMA DE MODELADO Y GENERACIÓN DE CÓDIGO FULLSTACK (UML STUDIO)
-- BASE DE DATOS: PostgreSQL (Compatible con v14+)
-- ESQUEMA DDL COMPLETO DE ENTIDADES (8 TABLAS)
-- La presencia en tiempo real (cursores, bloqueos) vive en memoria del gateway, no en BD
-- ==============================================================================

-- 1. EXTENSIÓN PARA GENERACIÓN DE IDENTIFICADORES UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TIPOS PERSONALIZADOS (ENUMS)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'project_members_role_enum') THEN
        CREATE TYPE public.project_members_role_enum AS ENUM ('OWNER', 'EDITOR', 'VIEWER');
    END IF;
END$$;

-- ==============================================================================
-- TABLA: users (CU-01: Gestión de Autenticación y Sesión de Usuario)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.users (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    is_active BOOLEAN DEFAULT TRUE NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- TABLA: projects (CU-02: Gestión de Proyectos)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    base_package VARCHAR(150) DEFAULT 'com.example.app' NOT NULL,
    java_version INTEGER DEFAULT 21 NOT NULL,
    spring_boot_version VARCHAR(20) DEFAULT '3.3.0' NOT NULL,
    created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- TABLA: project_members (CU-03: Gestión de Miembros y Roles)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.project_members (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    role public.project_members_role_enum DEFAULT 'EDITOR' NOT NULL,
    joined_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_project_members_project_user UNIQUE (project_id, user_id)
);

-- ==============================================================================
-- TABLA: diagrams (CU-04 / CU-07 / CU-08: Diagramas UML y Generación de Código)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.diagrams (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
    name VARCHAR(150) DEFAULT 'UML Class Diagram' NOT NULL,
    version VARCHAR(20) DEFAULT '1.0.0' NOT NULL,
    updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT NOW() NOT NULL
);

-- ==============================================================================
-- TABLA: uml_nodes (CU-04: Clases UML y Nodos de Lienzo)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.uml_nodes (
    id VARCHAR(100) PRIMARY KEY,
    diagram_id UUID NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
    name VARCHAR(150) DEFAULT 'ClassName' NOT NULL,
    position_x DOUBLE PRECISION DEFAULT 0 NOT NULL,
    position_y DOUBLE PRECISION DEFAULT 0 NOT NULL,
    width INTEGER DEFAULT 220 NOT NULL,
    height INTEGER,
    is_anchor BOOLEAN DEFAULT FALSE NOT NULL,
    assoc_main_conn_id VARCHAR(100)
);

-- ==============================================================================
-- TABLA: uml_attributes (CU-04: Atributos de Clases UML)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.uml_attributes (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    node_id VARCHAR(100) NOT NULL REFERENCES public.uml_nodes(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    type VARCHAR(100) DEFAULT 'String' NOT NULL,
    order_index INTEGER DEFAULT 0 NOT NULL
);

-- ==============================================================================
-- TABLA: uml_methods (CU-04: Métodos y Operaciones de Clases UML)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.uml_methods (
    id UUID DEFAULT public.uuid_generate_v4() PRIMARY KEY,
    node_id VARCHAR(100) NOT NULL REFERENCES public.uml_nodes(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    parameters VARCHAR(255) DEFAULT '' NOT NULL,
    return_type VARCHAR(100) DEFAULT 'void' NOT NULL,
    order_index INTEGER DEFAULT 0 NOT NULL
);

-- ==============================================================================
-- TABLA: uml_connections (CU-04: Relaciones de Asociación, Herencia, etc.)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS public.uml_connections (
    id VARCHAR(100) PRIMARY KEY,
    diagram_id UUID NOT NULL REFERENCES public.diagrams(id) ON DELETE CASCADE,
    source_node_id VARCHAR(100) NOT NULL REFERENCES public.uml_nodes(id) ON DELETE CASCADE,
    target_node_id VARCHAR(100) NOT NULL REFERENCES public.uml_nodes(id) ON DELETE CASCADE,
    source_id VARCHAR(120) NOT NULL,
    target_id VARCHAR(120) NOT NULL,
    type VARCHAR(50) NOT NULL,
    name VARCHAR(100),
    source_multiplicity VARCHAR(20) DEFAULT '1' NOT NULL,
    target_multiplicity VARCHAR(20) DEFAULT '0..*' NOT NULL,
    assoc_anchor_node_id VARCHAR(100)
);

-- ==============================================================================
-- ÍNDICES DE RENDIMIENTO (Performance Indexes)
-- ==============================================================================
CREATE INDEX IF NOT EXISTS idx_projects_created_by ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_project_members_user_id ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_diagrams_project_id ON public.diagrams(project_id);
CREATE INDEX IF NOT EXISTS idx_uml_nodes_diagram_id ON public.uml_nodes(diagram_id);
CREATE INDEX IF NOT EXISTS idx_uml_attributes_node_id ON public.uml_attributes(node_id);
CREATE INDEX IF NOT EXISTS idx_uml_methods_node_id ON public.uml_methods(node_id);
CREATE INDEX IF NOT EXISTS idx_uml_connections_diagram_id ON public.uml_connections(diagram_id);

-- ==============================================================================
-- MIGRACIÓN DESDE VERSIONES ANTERIORES (idempotente)
-- ==============================================================================
DROP TABLE IF EXISTS public.session_participants;
DROP TABLE IF EXISTS public.collaboration_sessions;
ALTER TABLE public.diagrams DROP COLUMN IF EXISTS yjs_binary_state;

-- Los diagramas se borran con su proyecto (antes quedaban huérfanos con project_id NULL)
DELETE FROM public.diagrams WHERE project_id IS NULL;
DO $$
DECLARE fk TEXT;
BEGIN
    FOR fk IN
        SELECT c.conname FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
        WHERE c.conrelid = 'public.diagrams'::regclass AND c.contype = 'f' AND a.attname = 'project_id'
    LOOP
        EXECUTE format('ALTER TABLE public.diagrams DROP CONSTRAINT %I', fk);
    END LOOP;
    ALTER TABLE public.diagrams
        ADD CONSTRAINT fk_diagrams_project FOREIGN KEY (project_id) REFERENCES public.projects(id) ON DELETE CASCADE;
END$$;
