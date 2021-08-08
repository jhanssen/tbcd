import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { MainComponent } from './main/main.component';
import { SanitizeUrlModule } from './sanitizeurl/sanitizeurl.module';
import { ImageComponent } from './image/image.component';

@NgModule({
  declarations: [
      AppComponent,
      MainComponent,
      ImageComponent
  ],
    imports: [
        BrowserModule,
        AppRoutingModule,
        SanitizeUrlModule
    ],
    providers: [],
    bootstrap: [AppComponent]
})
export class AppModule { }
