'use client'

import { useEffect } from 'react'

export function SWRegistration() {
	useEffect(() => {
		if (!('serviceWorker' in navigator)) return

		// Dev: unregister stale SW so login/navigation never hangs on cached handlers
		if (process.env.NODE_ENV !== 'production') {
			navigator.serviceWorker
				.getRegistrations()
				.then(registrations =>
					Promise.all(registrations.map(registration => registration.unregister())),
				)
				.catch(error => {
					console.warn('[PWA-Dev] Failed to unregister service workers:', error)
				})
			return
		}

		window.addEventListener('load', () => {
			navigator.serviceWorker
				.register('/sw.js', { scope: '/' })
				.then(registration => {
					console.log('[PWA] Service Worker registered, scope:', registration.scope)

					registration.onupdatefound = () => {
						const installingWorker = registration.installing
						if (!installingWorker) return
						installingWorker.onstatechange = () => {
							if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
								console.log('[PWA] New content available; please refresh.')
							}
						}
					}
				})
				.catch(error => {
					console.error('[PWA] Service Worker registration failed:', error)
				})
		})
	}, [])

	return null
}
