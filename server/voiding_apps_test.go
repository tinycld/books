package books

import (
	"testing"

	"github.com/pocketbase/pocketbase/tests"
)

func TestVoidingMarkerIsPerApp(t *testing.T) {
	newApp := func() *tests.TestApp {
		app, err := tests.NewTestApp()
		if err != nil {
			t.Fatalf("NewTestApp: %v", err)
		}
		t.Cleanup(app.Cleanup)
		return app
	}
	a, b := newApp(), newApp()

	done := markVoiding(a, "entry-1")
	if !isVoiding(a, "entry-1") {
		t.Fatal("app A does not see its own void in progress")
	}
	if isVoiding(b, "entry-1") {
		t.Fatal("app B sees app A's void in progress")
	}
	done()
	if isVoiding(a, "entry-1") {
		t.Fatal("the marker outlived the void")
	}
}
