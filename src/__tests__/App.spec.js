import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'

describe('App', () => {
  it('renders the game shell and bundled puzzle list', () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('Glitterati')
    expect(wrapper.text()).toContain('Bundled puzzles')
    
    // Check for "Sunrise Stripes" as it's our first canonical puzzle name
    expect(wrapper.text()).toContain('Sunrise Stripes')
    
    // Check for pagination indicators
    expect(wrapper.text()).toMatch(/Page\s+\d+\s*\/\s*\d+/)
    
    // We have many buttons (puzzles, reset, next, pagination), 
    // just check that we have a reasonable amount.
    expect(wrapper.findAll('button').length).toBeGreaterThan(5)
  })
})
