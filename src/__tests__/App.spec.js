import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import App from '../App.vue'
import puzzles from '../data/puzzles.json'

describe('App', () => {
  it('renders the game shell and bundled puzzle list', () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('Glitterati')
    expect(wrapper.text()).toContain('Bundled puzzles')
    expect(wrapper.text()).toContain('Sunrise Stripes')
    expect(wrapper.findAll('button')).toHaveLength(puzzles.length + 2)
  })
})
