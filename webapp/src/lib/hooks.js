/**
 * useAuth.js — Supabase auth hook
 * Drop-in replacement for the demo login screen.
 * Falls back to demo mode if Supabase is not configured.
 */
import { useState, useEffect } from 'react'
import { supabase, isConfigured } from './supabase'

export function useAuth() {
  const [session, setSession]   = useState(null)
  const [profile, setProfile]   = useState(null)
  const [org,     setOrg]       = useState(null)
  const [loading, setLoading]   = useState(true)
  const [error,   setError]     = useState(null)

  useEffect(() => {
    if (!isConfigured) { setLoading(false); return }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      if (session) fetchProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session)
        if (session) fetchProfile(session.user.id)
        else { setProfile(null); setOrg(null); setLoading(false) }
      }
    )
    return () => subscription.unsubscribe()
  }, [])

  async function fetchProfile(userId) {
    setLoading(true)
    try {
      const { data: profileData, error: pErr } = await supabase
        .from('profiles')
        .select('*, organizations(*)')
        .eq('id', userId)
        .single()

      if (pErr) throw pErr
      setProfile(profileData)
      setOrg(profileData.organizations)
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  async function signIn(email, password) {
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setError(error.message)
    return !error
  }

  async function signOut() {
    await supabase.auth.signOut()
    setProfile(null)
    setOrg(null)
  }

  return { session, profile, org, loading, error, signIn, signOut, isConfigured }
}


/**
 * useProjects.js — CRUD for projects, synced to Supabase.
 * When Supabase is not configured, works entirely in local state
 * (same as the demo prototype).
 */
import { useCallback } from 'react'

export function useProjects(initialProjects = []) {
  const [projects, setProjects] = useState(initialProjects)
  const [saving,   setSaving]   = useState(false)

  // Load all projects for the current org on mount
  useEffect(() => {
    if (!isConfigured) return
    loadProjects()
  }, [])

  async function loadProjects() {
    const { data, error } = await supabase
      .from('projects')
      .select('*, species(*), comments(*)')
      .order('created_at', { ascending: false })

    if (error) { console.error('loadProjects:', error); return }

    // Map snake_case DB columns → camelCase used in the app
    setProjects(data.map(dbToApp))
  }

  const createProject = useCallback(async (project) => {
    if (!isConfigured) {
      const newP = { ...project, id: Date.now() }
      setProjects(p => [newP, ...p])
      return newP
    }
    setSaving(true)
    const { data, error } = await supabase
      .from('projects')
      .insert(appToDB(project))
      .select()
      .single()
    setSaving(false)
    if (error) { console.error('createProject:', error); return null }
    const newP = dbToApp(data)
    setProjects(p => [newP, ...p])
    return newP
  }, [])

  const updateProject = useCallback(async (updated) => {
    setProjects(p => p.map(x => x.id === updated.id ? updated : x))
    if (!isConfigured) return

    setSaving(true)
    const { error } = await supabase
      .from('projects')
      .update(appToDB(updated))
      .eq('id', updated.id)
    setSaving(false)
    if (error) console.error('updateProject:', error)
  }, [])

  const deleteProject = useCallback(async (id) => {
    setProjects(p => p.filter(x => x.id !== id))
    if (!isConfigured) return
    await supabase.from('projects').delete().eq('id', id)
  }, [])

  // Species sub-operations
  const addSpecies = useCallback(async (projectId, species) => {
    if (!isConfigured) {
      setProjects(p => p.map(proj => {
        if (proj.id !== projectId) return proj
        const updated = { ...proj, species: [...proj.species, { ...species, id: Date.now() }] }
        updated.redListCount = updated.species.filter(s =>
          ['CR','EN','VU','NT'].includes(s.status)).length
        return updated
      }))
      return
    }
    const { data, error } = await supabase
      .from('species')
      .insert({ ...species, project_id: projectId })
      .select()
      .single()
    if (error) { console.error('addSpecies:', error); return }
    setProjects(p => p.map(proj => {
      if (proj.id !== projectId) return proj
      const updated = { ...proj, species: [...proj.species, data] }
      updated.redListCount = updated.species.filter(s =>
        ['CR','EN','VU','NT'].includes(s.status)).length
      return updated
    }))
  }, [])

  const addComment = useCallback(async (projectId, comment) => {
    const newComment = {
      ...comment,
      id: isConfigured ? undefined : Date.now(),
      project_id: projectId,
    }
    if (!isConfigured) {
      setProjects(p => p.map(proj =>
        proj.id === projectId
          ? { ...proj, comments: [...proj.comments, { ...newComment, id: Date.now() }] }
          : proj
      ))
      return
    }
    const { data, error } = await supabase
      .from('comments')
      .insert(newComment)
      .select()
      .single()
    if (error) { console.error('addComment:', error); return }
    setProjects(p => p.map(proj =>
      proj.id === projectId
        ? { ...proj, comments: [...proj.comments, data] }
        : proj
    ))
  }, [])

  return {
    projects,
    saving,
    createProject,
    updateProject,
    deleteProject,
    addSpecies,
    addComment,
    reload: loadProjects,
  }
}


// ── Data mappers (DB snake_case ↔ App camelCase) ─────────────────────────────

function dbToApp(row) {
  return {
    id:           row.id,
    name:         row.name,
    client:       row.client,
    type:         row.type || 'wind',
    stage:        row.stage,
    pref:         row.pref,
    deadline:     row.deadline,
    area:         row.area,
    budget:       row.budget,
    desc:         row.description,
    manager:      row.manager,
    risk:         row.risk,
    progress:     row.progress,
    redListCount: row.red_list_count,
    tasks:        row.tasks || {},
    species:      (row.species || []).map(s => ({
      id:        s.id,
      name:      s.name,
      latin:     s.latin,
      type:      s.type,
      status:    s.status,
      protected: s.protected,
      count:     s.count,
      location:  s.location,
      date:      s.obs_date,
      notes:     s.notes,
    })),
    comments: (row.comments || []).map(c => ({
      id:     c.id,
      text:   c.body,
      author: c.author_name,
      role:   c.role,
      date:   new Date(c.created_at).toLocaleDateString('ja-JP'),
    })),
    documents: row.documents || [],
  }
}

function appToDB(project) {
  return {
    name:          project.name,
    client:        project.client,
    type:          project.type,
    stage:         project.stage,
    pref:          project.pref,
    deadline:      project.deadline,
    area:          project.area,
    budget:        project.budget,
    description:   project.desc,
    manager:       project.manager,
    risk:          project.risk,
    progress:      project.progress,
    red_list_count: project.redListCount,
    tasks:         project.tasks,
  }
}
