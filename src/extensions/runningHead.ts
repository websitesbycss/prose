import { Extension } from '@tiptap/core'

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    runningHead: {
      setRunningHead(value: string | null): ReturnType
    }
  }
}

export const RunningHead = Extension.create({
  name: 'runningHead',

  addGlobalAttributes() {
    return [
      {
        types: ['doc'],
        attributes: {
          runningHead: {
            default: null,
          },
        },
      },
    ]
  },

  addCommands() {
    return {
      setRunningHead:
        (value: string | null) =>
        ({ tr, dispatch }) => {
          if (dispatch) {
            // setDocAttribute exists in prosemirror-state ≥ 1.4.3 but is not yet
            // reflected in the bundled TypeScript declarations
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ;(tr as any).setDocAttribute('runningHead', value)
            dispatch(tr)
          }
          return true
        },
    }
  },
})
