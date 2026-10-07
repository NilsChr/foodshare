import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'
import Layout from './components/Layout'
import './index.css'
import { AuthProvider } from './lib/auth'
import ListPage from './pages/ListPage'
import PantryPage from './pages/PantryPage'
import RecipeEdit from './pages/RecipeEdit'
import RecipePage from './pages/RecipePage'
import RecipesPage from './pages/RecipesPage'
import OffersPage from './pages/OffersPage'
import SavingsPage from './pages/SavingsPage'
import SpacePage from './pages/SpacePage'
import WeekPage from './pages/WeekPage'

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/list" replace /> },
      { path: 'list', element: <ListPage /> },
      { path: 'week', element: <WeekPage /> },
      { path: 'pantry', element: <PantryPage /> },
      { path: 'recipes', element: <RecipesPage /> },
      { path: 'recipes/new', element: <RecipeEdit /> },
      { path: 'recipes/:id', element: <RecipePage /> },
      { path: 'recipes/:id/edit', element: <RecipeEdit /> },
      { path: 'space', element: <SpacePage /> },
      { path: 'savings', element: <SavingsPage /> },
      { path: 'offers', element: <OffersPage /> },
      { path: '*', element: <Navigate to="/list" replace /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AuthProvider>
      <RouterProvider router={router} />
    </AuthProvider>
  </StrictMode>,
)
