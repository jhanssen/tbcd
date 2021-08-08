import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { MainComponent } from './main/main.component';
import { ImageComponent } from './image/image.component';
import { ScrapeComponent } from './scrape/scrape.component';
import { ConfigComponent } from './config/config.component';

const routes: Routes = [
    { path: '', component: MainComponent },
    { path: 'config', component: ConfigComponent },
    { path: 'image/:file/:name/:sha1', component: ImageComponent },
    { path: 'scrape/:name/:sha1', component: ScrapeComponent }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule]
})
export class AppRoutingModule { }
